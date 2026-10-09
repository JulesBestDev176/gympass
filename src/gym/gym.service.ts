import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGymDto, UpdatePricingDto } from './dto/update-gym.dto';

@Injectable()
export class GymService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(gymId: string) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');
    return gym;
  }

  async update(gymId: string, dto: UpdateGymDto) {
    return this.prisma.gym.update({ where: { id: gymId }, data: dto });
  }

  async updatePricing(gymId: string, dto: UpdatePricingDto) {
    return this.prisma.gym.update({ where: { id: gymId }, data: dto });
  }
}
