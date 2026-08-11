import { Module } from '@nestjs/common';
import { PitchesController } from './pitches.controller';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [MatchesModule],
  controllers: [PitchesController],
})
export class PitchesModule {}
