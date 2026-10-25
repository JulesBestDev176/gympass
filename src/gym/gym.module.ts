import { Module } from '@nestjs/common';
import { GymService } from './gym.service';
import { GymController } from './gym.controller';
import { MembersModule } from '../members/members.module';
import { UsersModule } from '../users/users.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { UploadModule } from '../upload/upload.module';
import { GymBrandingService } from './gym-branding.service';
import { GymBrandingController } from './gym-branding.controller';

@Module({
  imports: [MembersModule, UsersModule, WhatsappModule, UploadModule],
  controllers: [GymBrandingController, GymController],
  providers: [GymService, GymBrandingService],
  exports: [GymService],
})
export class GymModule {}
