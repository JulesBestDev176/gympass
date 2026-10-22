import { Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MemberCardDeliveryService } from './member-card-delivery.service';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard, ThrottlerGuard)
@Roles(UserRole.ADMIN, UserRole.GERANT)
export class MemberCardDeliveryController {
  constructor(private readonly delivery: MemberCardDeliveryService) {}

  @Get(':id/card-whatsapp')
  status(@CurrentUser() user: any, @Param('id') id: string) {
    return this.delivery.status(user.gymId, id);
  }

  @Post(':id/card-whatsapp')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 0 } }))
  send(@CurrentUser() user: any, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.delivery.send(user.gymId, id, file);
  }
}
