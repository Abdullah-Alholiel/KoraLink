import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { MailerService } from './mailer.service';
import { MailerUsersService } from './mailer-users.service';
import { MailerController } from './mailer.controller';
import { EMAIL_SENDER_PROVIDER } from '../auth/email-sender.provider';

/**
 * P1-41 (run #35) — transactional email module.
 *
 * Imports NOTHING but the (global) ConfigModule + its own JwtModule
 * registration — so any module can import MailerModule without cycles.
 * The JwtModule here shares JWT_SECRET with auth but is an INDEPENDENT
 * instance (the mailer mints purpose:'email-verify' tokens; auth never
 * needs the mailer). Keep this wiring cycle-free after the review phase.
 *
 * D-20261114-02 (run #207): EMAIL_SENDER_PROVIDER is registered HERE
 * directly (not via an AuthModule import — auth already imports MailerModule,
 * so importing AuthModule back would cycle). The factory is a pure function
 * of env, so both modules resolve the SAME adapter instance selection rule;
 * each module gets its own adapter object, which is stateless (ConfigService
 * reads at send time) and therefore equivalent.
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
  providers: [MailerService, MailerUsersService, EMAIL_SENDER_PROVIDER],
  exports: [MailerService, MailerUsersService],
})
export class MailerModule {}
