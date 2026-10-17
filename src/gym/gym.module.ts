import { Module } from '@nestjs/common';
import { GymService } from './gym.service';
import { GymController } from './gym.controller';
import { MembersModule } from '../members/members.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [MembersModule, UsersModule],
  controllers: [GymController],
  providers: [GymService],
  exports: [GymService],
})
export class GymModule {}
