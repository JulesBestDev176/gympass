import { ExercisesModule } from '../exercises/exercises.module';
import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { GymbroAuthModule } from '../auth/gymbro-auth.module';
import { ProgramImportService } from './program-import.service';

@Module({
  imports: [ExercisesModule, GymbroAuthModule],
  controllers: [ProgramsController],
  providers: [ProgramsService, ProgramImportService],
  exports: [ProgramsService, ProgramImportService],
})
export class ProgramsModule {}
