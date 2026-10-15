import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { GymbroAuthModule } from '../auth/gymbro-auth.module';
import { GymbroSubscriptionGuard } from './guards/subscription.guard';

@Module({
  imports: [GymbroAuthModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, GymbroSubscriptionGuard],
  exports: [SubscriptionsService, GymbroSubscriptionGuard],
})
export class SubscriptionsModule {}
