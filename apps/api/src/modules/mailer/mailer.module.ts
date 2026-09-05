import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { MailerService } from './mailer.service';
import { MailerUsersService } from './mailer-users.service';
import { MailerController } from './mailer.controller';

/**
 * P1-41 (run #35) — transactional email module.
 *
 * Imports NOTHING but the (global) ConfigModule + its own JwtModule
 * registration — so any module can import MailerModule without cycles.
 * The JwtModule here shares JWT_SECRET with auth but is an INDEPENDENT
 * instance (the mailer mints purpose:'email-verify' tokens; auth never
 * needs the mailer). Keep this wiring cycle-free after the review phase.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MailerController],
  providers: [MailerService, MailerUsersService],
  exports: [MailerService, MailerUsersService],
})
export class MailerModule {}
