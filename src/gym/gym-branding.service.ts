import { Injectable, NotFoundException } from '@nestjs/common';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';

export class UpdateBrandingDto {
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'La couleur doit être au format #RRGGBB.' })
  brandColor?: string | null;

  @IsOptional()
  @IsBoolean()
  removeLogo?: boolean;
}

const selection = { id: true, nom: true, logoUrl: true, brandColor: true } as const;

@Injectable()
export class GymBrandingService {
  constructor(private readonly prisma: PrismaService, private readonly upload: UploadService) {}

  async get(gymId: string) {
    if (!gymId) throw new NotFoundException('Salle introuvable.');
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: selection });
    if (!gym) throw new NotFoundException('Salle introuvable.');
    return gym;
  }

  async update(gymId: string, dto: UpdateBrandingDto) {
    await this.get(gymId);
    return this.prisma.gym.update({ where: { id: gymId }, select: selection, data: {
      ...(dto.brandColor !== undefined ? { brandColor: dto.brandColor?.toUpperCase() ?? null } : {}),
      ...(dto.removeLogo === true ? { logoUrl: null } : {}),
    } });
  }

  async logo(gymId: string, buffer: Buffer) {
    await this.get(gymId);
    const { url } = await this.upload.uploadGymLogo(gymId, buffer);
    return this.prisma.gym.update({ where: { id: gymId }, select: selection, data: { logoUrl: url } });
  }
}
