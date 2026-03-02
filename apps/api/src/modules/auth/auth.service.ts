import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UnifonicService } from './unifonic.service';
import { CompleteProfileDto } from './dto/complete-profile.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
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
    await this.prisma.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });

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

    const user = await this.prisma.user.findUniqueOrThrow({ where: { phone } });
    const isNewUser = !user.full_name;

    const token = this.jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role },
      { expiresIn: this.config.get('JWT_EXPIRY', '7d') },
    );

    return { token, isNewUser };
  }

  async completeProfile(userId: string, dto: CompleteProfileDto) {
    const existing = await this.prisma.user.findUnique({
      where: { handle: dto.handle },
    });

    if (existing && existing.id !== userId) {
      throw new BadRequestException('Handle already taken.');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        phone: true,
        full_name: true,
        handle: true,
        avatar_url: true,
        skill_level: true,
        preferred_location: true,
        preferred_position: true,
        role: true,
      },
    });
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}

// Ephemeral in-memory OTP store — swap for Redis in production.
const otpStore = new Map<string, { code: string; expiresAt: Date }>();
