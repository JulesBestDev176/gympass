import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private omitPassword<T extends { passwordHash?: string }>(user: T) {
    const { passwordHash: _, ...rest } = user;
    return rest;
  }

  async findAll(gymId: string) {
    const users = await this.prisma.user.findMany({
      where: { gymId },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => this.omitPassword(u));
  }

  async findGerants(gymId: string) {
    const users = await this.prisma.user.findMany({
      where: { gymId, role: UserRole.GERANT },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u) => this.omitPassword(u));
  }

  async findOne(gymId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, gymId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.omitPassword(user);
  }

  async findMe(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { gym: true } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return this.omitPassword(user);
  }

  async create(gymId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email déjà utilisé');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        gymId,
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        telephone: dto.telephone,
        passwordHash,
        role: dto.role ?? UserRole.GERANT,
        mustChangePassword: true, // Force le changement au premier login
      },
    });

    // Envoi des identifiants par WhatsApp si numéro fourni
    if (dto.telephone) {
      await this.whatsapp.sendCredentials(dto.telephone, dto.email, dto.password, user.prenom);
    }

    return this.omitPassword(user);
  }

  async update(gymId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(gymId, id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.omitPassword(user);
  }

  async toggle(gymId: string, id: string) {
    const user = (await this.findOne(gymId, id)) as any;
    const updated = await this.prisma.user.update({
      where: { id },
      data: { actif: !user.actif },
    });
    return this.omitPassword(updated);
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { fcmToken } });
    return { message: 'Token FCM enregistré' };
  }
}
