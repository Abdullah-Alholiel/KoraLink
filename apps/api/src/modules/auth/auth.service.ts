import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
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
    // ── Abuse protection: resend cooldown + daily SMS cap ──
    if (await this.otpStore.isCooldownActive(phone)) {
      this.logger.warn(`send-otp blocked (cooldown) for ${phone}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Please wait before requesting another code.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const dailyCount = await this.otpStore.getDailyCount(phone);
    if (dailyCount >= OtpStoreService.DAILY_CAP) {
      this.logger.warn(
        `send-otp blocked (daily cap ${dailyCount}/${OtpStoreService.DAILY_CAP}) for ${phone}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Daily SMS limit reached. Try again tomorrow.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateOtp();

    // Upsert user record so the phone always exists before OTP is saved.
    await this.db
      .insert(users)
      .values(withTimestamp({ phone }))
      .onConflictDoNothing({ target: users.phone });

    // Store OTP in Redis via cache-manager (5-minute TTL handled by store).
    await this.otpStore.setOtp(phone, code);
    await this.otpStore.setCooldown(phone);
    await this.otpStore.incrementDaily(phone);

    await this.unifonic.sendSms(phone, `Your KoraLink code: ${code}`);
  }

  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ token: string; isNewUser: boolean }> {
    // ── Abuse protection: attempt lockout ──
    const failCount = await this.otpStore.getFailCount(phone);
    if (failCount >= OtpStoreService.FAIL_LIMIT) {
      this.logger.warn(`verify-otp blocked (lockout after ${failCount} fails) for ${phone}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many attempts. Try again later.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const storedCode = await this.otpStore.getOtp(phone);

    if (!storedCode || storedCode !== code) {
      await this.otpStore.incrementFail(phone);
      throw new UnauthorizedException('Invalid or expired OTP.');
    }

    await this.otpStore.deleteOtp(phone);
    await this.otpStore.resetFails(phone);

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
     .select({ id: users.id, phone: users.phone, role: users.role })
     .from(users)
     .where(eq(users.phone, phone))
     .limit(1);

   if (!user) {
     throw new NotFoundException(
       `No user found with phone ${phone}. Seed the database first.`,
     );
   }

   return this.jwt.signAsync({
     sub: user.id,
     phone: user.phone,
     role: user.role,
   });
 }
 }
