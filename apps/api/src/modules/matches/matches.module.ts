import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { WalletModule } from '../wallet/wallet.module';
import { GatewayModule } from '../gateway/gateway.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [WalletModule, GatewayModule, NotificationsModule, ActivitiesModule],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule implements OnModuleInit {
  private readonly logger = new Logger(MatchesModule.name);

  constructor(private readonly matchesService: MatchesService) {}

  async onModuleInit() {
    const count = await this.matchesService.autoCompletePastMatches();
    if (count > 0) {
      this.logger.log(`Auto-completed ${count} past matches → Completed`);
    }
  }
}
