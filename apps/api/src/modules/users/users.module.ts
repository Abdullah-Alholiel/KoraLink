import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  // P0-6 (run #29): AuthModule is imported for JwtService + ConfigService
  // used by UsersService.softDelete (mints a one-time `purpose: 'restore'`
  // token for the 30-day grace restore flow). PassportModule + JwtModule
  // are re-exported from AuthModule.
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
