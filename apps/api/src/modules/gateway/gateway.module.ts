import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppGateway } from './app.gateway';
import { RealtimeService } from './realtime.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'fallback-dev-secret'),
      }),
      inject: [ConfigService],
    }),
    ConversationsModule,
    forwardRef(() => ActivitiesModule),
    NotificationsModule,
  ],
  providers: [AppGateway, RealtimeService],
  exports: [AppGateway, RealtimeService],
})
export class GatewayModule {}
