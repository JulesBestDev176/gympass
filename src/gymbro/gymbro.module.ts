import { Module } from '@nestjs/common';
import { GymbroAuthModule } from './auth/gymbro-auth.module';
import { QuestionnaireModule } from './questionnaire/questionnaire.module';
import { ExercisesModule } from './exercises/exercises.module';
import { ProgramsModule } from './programs/programs.module';
import { MatchingModule } from './matching/matching.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SessionsModule } from './sessions/sessions.module';
import { ProgressModule } from './progress/progress.module';

@Module({
  imports: [
    GymbroAuthModule,
    QuestionnaireModule,
    ExercisesModule,
    ProgramsModule,
    MatchingModule,
    SubscriptionsModule,
    SessionsModule,
    ProgressModule,
  ],
})
export class GymbroModule {}
