import { Module, forwardRef } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [forwardRef(() => GatewayModule), MailerModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
