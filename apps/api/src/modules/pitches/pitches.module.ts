import { Module } from '@nestjs/common';
import { PitchesController } from './pitches.controller';
import { PitchesService } from './pitches.service';
import { MatchesModule } from '../matches/matches.module';

@Module({
  imports: [MatchesModule],
  controllers: [PitchesController],
  providers: [PitchesService],
})
export class PitchesModule {}
