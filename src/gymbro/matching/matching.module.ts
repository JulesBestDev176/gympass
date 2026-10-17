import { ExercisesModule } from '../exercises/exercises.module';
import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { MatchingController } from './matching.controller';
import { GymbroAuthModule } from '../auth/gymbro-auth.module';

@Module({
  imports: [ExercisesModule, GymbroAuthModule],
  controllers: [MatchingController],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
