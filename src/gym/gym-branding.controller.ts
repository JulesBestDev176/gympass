import { BadRequestException, Body, Controller, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GymBrandingService, UpdateBrandingDto } from './gym-branding.service';

@Controller('gym/branding')
@UseGuards(JwtAuthGuard)
export class GymBrandingController {
  constructor(private readonly branding: GymBrandingService) {}

  @Get()
  get(@CurrentUser() user: any) { return this.branding.get(user.gymId); }

  @Patch()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@CurrentUser() user: any, @Body() dto: UpdateBrandingDto) {
    return this.branding.update(user.gymId, dto);
  }

  @Post('logo')
  @UseGuards(RolesGuard, ThrottlerGuard)
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
    fileFilter: (_req, file, cb) => ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)
      ? cb(null, true) : cb(new BadRequestException('Utilisez un logo PNG, JPEG ou WebP.'), false) }))
  logo(@CurrentUser() user: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Logo manquant (champ : file).');
    return this.branding.logo(user.gymId, file.buffer);
  }
}
