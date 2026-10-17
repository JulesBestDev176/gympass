import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsInt, IsOptional, Min, IsNotEmpty } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGymDto, UpdatePricingDto, UpdateStatutDto } from './dto/update-gym.dto';

export class CreateGymDto {
  @IsString() @IsNotEmpty() nom: string;
  @IsString() @IsNotEmpty() slug: string;
  @IsString() @IsNotEmpty() ville: string;
  @IsOptional() @IsString() pays?: string;
  @IsOptional() @IsInt() @Min(0) fraisInscription?: number;
  @IsOptional() @IsInt() @Min(0) prixMensualite?: number;
  @IsOptional() @IsInt() @Min(1) dureeMensualite?: number;
  @IsOptional() @IsInt() @Min(0) prixSeance?: number;
}

@Injectable()
export class GymService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const gyms = await this.prisma.gym.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { members: true, users: true } },
      },
    });

    const revenues = await Promise.all(
      gyms.map((g) =>
        this.prisma.payment.aggregate({
          where: { gymId: g.id, createdAt: { gte: startOfMonth } },
          _sum: { montantFcfa: true },
        }),
      ),
    );

    return gyms.map((g, i) => ({
      ...g,
      nbAdherents: g._count.members,
      nbUsers: g._count.users,
      revenuMois: revenues[i]._sum.montantFcfa ?? 0,
    }));
  }

  async create(dto: CreateGymDto) {
    return this.prisma.gym.create({
      data: {
        nom: dto.nom,
        slug: dto.slug,
        ville: dto.ville,
        pays: dto.pays ?? 'SN',
        fraisInscription: dto.fraisInscription ?? 5000,
        prixMensualite: dto.prixMensualite ?? 25000,
        dureeMensualite: dto.dureeMensualite ?? 30,
        prixSeance: dto.prixSeance ?? 2500,
      },
    });
  }

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

  async updateStatut(gymId: string, dto: UpdateStatutDto) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');
    return this.prisma.gym.update({ where: { id: gymId }, data: { statut: dto.statut } });
  }
}
