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
import { OtpStoreService } from './otp-store.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { withTimestamp } from '../../common/utils/timestamp';
import { randomInt } from 'node:crypto';

type DB = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject('DB_CONNECTION') private readonly db: DB,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly unifonic: UnifonicService,
    private readonly otpStore: OtpStoreService,
  ) {
    this.logger.log('OTP store backed by Redis (cache-manager).');
  }

  async sendOtp(phone: string): Promise<void> {
    const code = this.generateOtp();

    // Upsert user record so the phone always exists before OTP is saved.
    await this.db
      .insert(users)
      .values(withTimestamp({ phone }))
      .onConflictDoNothing({ target: users.phone });

    // Store OTP in Redis via cache-manager (5-minute TTL handled by store).
    await this.otpStore.setOtp(phone, code);

    await this.unifonic.sendSms(phone, `Your KoraLink code: ${code}`);
  }

  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ token: string; isNewUser: boolean }> {
    const storedCode = await this.otpStore.getOtp(phone);

    if (!storedCode || storedCode !== code) {
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    await this.otpStore.deleteOtp(phone);

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
   // crypto.randomInt uses the OS CSPRNG — unlike Math.random() it is
   // cryptographically secure and suitable for OTP generation.
   return randomInt(100_000, 1_000_000).toString();
 }

 /**
  * DEV ONLY — Returns a JWT for a seeded user by phone number.
  * Skips OTP entirely. Blocked in production by the controller.
  */
 async devLogin(phone: string): Promise<string> {
   const [user] = await this.db
     .select({ id: users.id, phone: users.phone })
     .from(users)
     .where(eq(users.phone, phone))
     .limit(1);

   if (!user) {
     throw new NotFoundException(
       `No user found with phone ${phone}. Seed the database first.`,
     );
   }

   return this.jwt.signAsync({ sub: user.id });
 }
 }
