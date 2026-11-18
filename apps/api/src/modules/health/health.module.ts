import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CaptchaModule } from '../../common/captcha/captcha.module';

@Module({
  imports: [CaptchaModule],
  controllers: [HealthController],
})
export class HealthModule {}
