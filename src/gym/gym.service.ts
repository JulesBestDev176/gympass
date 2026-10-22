import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IsString, IsInt, IsOptional, Min, IsNotEmpty } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGymDto, UpdatePricingDto, UpdateStatutDto } from './dto/update-gym.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { publicStaffUser } from '../auth/password-security';

export class AdminCreateGymbroUserDto {
  @IsString() @IsNotEmpty() prenom: string;
  @IsString() @IsNotEmpty() nom: string;
  @IsString() @IsNotEmpty() telephone: string;
  @IsString() @IsNotEmpty() password: string;
  @IsOptional() @IsString() role?: 'USER' | 'COACH';
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

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

  async findAllUsers() {
    const raw = this.config.get<string>('GYMDASH_BILLING_ADMIN_EMAILS') ?? '';
    const adminEmails = raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { gym: { select: { id: true, nom: true, slug: true } } },
      ...(adminEmails.length > 0
        ? { where: { email: { notIn: adminEmails, mode: 'insensitive' } } }
        : {}),
    });
    return users.map(publicStaffUser);
  }

  async findAllGymbroUsers() {
    const users = await this.prisma.gymbroUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          orderBy: { dateExpiration: 'desc' },
          take: 1,
        },
      },
    });
    return users.map(({ passwordHash, refreshTokenHash, ...u }) => u);
  }

  async setGymbroUserRole(id: string, role: 'USER' | 'COACH') {
    const user = await this.prisma.gymbroUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur GymBro introuvable');
    const updated = await this.prisma.gymbroUser.update({
      where: { id },
      data: { role: role as any },
    });
    const { passwordHash, refreshTokenHash, ...safe } = updated;
    return safe;
  }

  async toggleGymbroUserActif(id: string) {
    const user = await this.prisma.gymbroUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur GymBro introuvable');
    const updated = await this.prisma.gymbroUser.update({
      where: { id },
      data: { actif: !user.actif },
    });
    const { passwordHash, refreshTokenHash, ...safe } = updated;
    return safe;
  }

  async findAllPayments() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        member: { select: { id: true, nom: true, prenom: true } },
        gym: { select: { id: true, nom: true, ville: true } },
        user: { select: { id: true, nom: true, prenom: true } },
      },
    });
  }

  async findPaymentsByGym(gymId: string) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');
    return this.prisma.payment.findMany({
      where: { gymId },
      orderBy: { createdAt: 'desc' },
      include: {
        member: { select: { id: true, nom: true, prenom: true } },
        user: { select: { id: true, nom: true, prenom: true } },
      },
    });
  }

  async createGymbroUser(dto: AdminCreateGymbroUserDto) {
    const phone = dto.telephone.trim();
    const systemEmail = `${phone.replace(/\D/g, '')}@gymbro.sn`;

    const existing = await this.prisma.gymbroUser.findUnique({ where: { email: systemEmail } });
    if (existing) throw new ConflictException('Un compte avec ce numéro existe déjà');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.gymbroUser.create({
      data: {
        email: systemEmail,
        passwordHash,
        prenom: dto.prenom.trim(),
        nom: dto.nom.trim(),
        telephone: phone,
        role: (dto.role ?? 'USER') as any,
        profile: { create: {} },
      },
    });
    const { passwordHash: _, refreshTokenHash: __, ...safe } = user;
    const whatsapp = await this.whatsapp.sendGymbroCredentials(phone, dto.password, user.prenom);
    return { ...safe, whatsapp };
  }

  async findGymbroUser(id: string) {
    const user = await this.prisma.gymbroUser.findUnique({
      where: { id },
      include: {
        subscriptions: { orderBy: { dateExpiration: 'desc' } },
        profile: true,
        userPrograms: {
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: {
            program: {
              select: {
                id: true, nom: true, objectif: true,
                nbSemaines: true, seancesParSemaine: true, niveauMin: true, niveauMax: true,
              },
            },
            sessions: { select: { statut: true } },
          },
        },
        weightLogs: { orderBy: { date: 'asc' } },
        bilans: { orderBy: { semaine: 'asc' } },
      },
    });
    if (!user) throw new NotFoundException('Utilisateur GymBro introuvable');
    const { passwordHash, refreshTokenHash, ...safe } = user;
    return safe;
  }
}
