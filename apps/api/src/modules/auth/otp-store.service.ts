import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

const OTP_PREFIX = 'otp:';
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class OtpStoreService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async setOtp(phone: string, code: string): Promise<void> {
    await this.cache.set(`${OTP_PREFIX}${phone}`, code, OTP_TTL_MS);
  }

  async getOtp(phone: string): Promise<string | undefined> {
    return this.cache.get<string>(`${OTP_PREFIX}${phone}`);
  }

  async deleteOtp(phone: string): Promise<void> {
    await this.cache.del(`${OTP_PREFIX}${phone}`);
  }
}
