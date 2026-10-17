import { Module } from '@nestjs/common';
import { ExerciseCatalogService } from './exercise-catalog.service';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { GymbroAuthModule } from '../auth/gymbro-auth.module';

@Module({
  imports: [GymbroAuthModule],
  controllers: [ExercisesController],
  providers: [ExercisesService, ExerciseCatalogService],
  exports: [ExercisesService],
})
export class ExercisesModule {}
