import { Module, forwardRef } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [forwardRef(() => GatewayModule)],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
