import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SchedulerModule, NotificationsModule],
  controllers: [MembersController],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
