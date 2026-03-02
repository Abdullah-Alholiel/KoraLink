import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../../database/schema';
import { users } from '../../database/schema';
import { UnifonicService } from './unifonic.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { withTimestamp } from '../../common/utils/timestamp';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly unifonic: UnifonicService,
  ) {
    if (config.get('NODE_ENV') === 'production') {
      this.logger.warn(
        'In-memory OTP store is active in production. ' +
          'Replace with a Redis-backed store before go-live.',
      );
    }
  }

  async sendOtp(phone: string): Promise<void> {
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Upsert user record so the phone always exists before OTP is saved.
    await this.db
      .insert(users)
      .values({ phone })
      .onConflictDoNothing({ target: users.phone });

    // Store OTP in a dedicated cache / table. Using a simple in-memory map for
    // scaffolding; replace with Redis in production.
    otpStore.set(phone, { code, expiresAt });

    await this.unifonic.sendSms(phone, `Your KoraLink code: ${code}`);
  }

  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ token: string; isNewUser: boolean }> {
    const entry = otpStore.get(phone);

    if (!entry || entry.code !== code || entry.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    otpStore.delete(phone);

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const isNewUser = !user.full_name;

    const token = this.jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role },
      { expiresIn: this.config.get('JWT_EXPIRY', '7d') },
    );

    return { token, isNewUser };
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, dto.handle))
      .limit(1);

    if (existing && existing.id !== userId) {
      throw new BadRequestException('Handle already taken.');
    }

    const [updated] = await this.db
      .update(users)
      .set(withTimestamp(dto))
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        phone: users.phone,
        full_name: users.full_name,
        handle: users.handle,
        avatar_url: users.avatar_url,
        skill_level: users.skill_level,
        preferred_location: users.preferred_location,
        preferred_position: users.preferred_position,
        role: users.role,
      });

    return updated;
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

// Ephemeral in-memory OTP store — swap for Redis in production.
const otpStore = new Map<string, { code: string; expiresAt: Date }>();
