import { ExercisesModule } from '../exercises/exercises.module';
import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { GymbroAuthModule } from '../auth/gymbro-auth.module';

@Module({
  imports: [ExercisesModule, GymbroAuthModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
