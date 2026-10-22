import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { MemberCardDeliveryService } from './member-card-delivery.service';
import { MemberCardDeliveryController } from './member-card-delivery.controller';

@Module({
  imports: [SchedulerModule, NotificationsModule, WhatsappModule],
  controllers: [MembersController, MemberCardDeliveryController],
  providers: [MembersService, MemberCardDeliveryService],
  exports: [MembersService],
})
export class MembersModule {}
