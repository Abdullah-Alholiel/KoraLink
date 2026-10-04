import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersScheduler } from './users.scheduler';
import { BlocksService } from './blocks.service';
import { BlocksController } from './blocks.controller';
import { AuthModule } from '../auth/auth.module';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  // P0-6 (run #29): AuthModule is imported for JwtService + ConfigService
  // used by UsersService.softDelete (mints a one-time `purpose: 'restore'`
  // token for the 30-day grace restore flow). PassportModule + JwtModule
  // are re-exported from AuthModule.
  //
  // P0-6 (run #30): UsersScheduler joins the providers array so the
  // `@Cron('0 */5 * * *')` decorator registers the 5h hard-purge tick.
  // NestJS auto-instantiates providers with `providedIn`-style DI, and
  // the ScheduleModule is already global (root app.module.ts).
  imports: [AuthModule, MailerModule],
  //
  // P1-53: BlocksService is exported so ConversationsModule can refuse DMs
  // across a block (sendMessage → assertNotBlockedBetween).
  controllers: [UsersController, BlocksController],
  providers: [UsersService, UsersScheduler, BlocksService],
  exports: [UsersService, BlocksService],
})
export class UsersModule {}
