import { Injectable, NotFoundException, ConflictException, BadRequestException, HttpException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AdminUpdateUserDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { staffEmailParts, staffEmailCandidate, isEmailUniqueCollision } from './staff-email';
import { phoneUniqueCollision, staffPhone } from './staff-phone';
import { clearRecovery, publicStaffUser } from '../auth/password-security';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private omitPassword<T extends { passwordHash?: string }>(user: T) {
    return publicStaffUser(user);
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
    const telephone = staffPhone(dto.telephone);
    await this.assertPhoneAvailable(gymId, telephone);
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Salle introuvable');
    const parts = staffEmailParts(dto.prenom, dto.nom, gym.nom || gym.slug);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    for (let suffix = 0; suffix < 10000; suffix++) {
      const email = staffEmailCandidate(parts, suffix);
      if (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) continue;
      let user;
      try {
        user = await this.prisma.user.create({
          data: {
            gymId,
            nom: dto.nom,
            prenom: dto.prenom,
            email,
            telephone,
            passwordHash,
            role: dto.role ?? UserRole.GERANT,
            mustChangePassword: true,
          },
        });
      } catch (error) {
        if (phoneUniqueCollision(error)) throw new ConflictException('Ce numéro WhatsApp est déjà utilisé dans cette salle.');
        // Another registration may have reserved the candidate after the lookup.
        if (isEmailUniqueCollision(error)) continue;
        throw error;
      }

      // Envoi de l’adresse réellement enregistrée, suffixe compris.
      const whatsapp = await this.whatsapp.sendCredentials(telephone, user.email, dto.password, user.prenom);
      return { ...this.omitPassword(user), whatsapp };
    }
    throw new ConflictException('Impossible de générer une adresse de connexion disponible');
  }

  async update(gymId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(gymId, id);
    const data: any = { ...dto };
    if (dto.telephone !== undefined) {
      data.telephone = staffPhone(dto.telephone);
      await this.assertPhoneAvailable(gymId, data.telephone, id);
      Object.assign(data, clearRecovery);
    }
    try {
      const user = await this.prisma.user.update({ where: { id }, data });
      return this.omitPassword(user);
    } catch (error) {
      if (phoneUniqueCollision(error)) throw new ConflictException('Ce numéro WhatsApp est déjà utilisé dans cette salle.');
      throw error;
    }
  }

  private async assertPhoneAvailable(gymId: string, telephone: string, exceptId?: string) {
    const existing = await this.prisma.user.findFirst({ where: { gymId, telephone, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (existing) throw new ConflictException('Ce numéro WhatsApp est déjà utilisé dans cette salle.');
  }

  async renewPassword(gymId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, gymId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable dans cette salle.');
    if (!user.actif) throw new BadRequestException('Activez ce compte avant de renouveler son mot de passe.');
    const telephone = staffPhone(user.telephone);
    await this.assertPhoneAvailable(gymId, telephone, id);
    if (user.passwordRenewedAt && Date.now() - user.passwordRenewedAt.getTime() < 60000) {
      throw new HttpException('Patientez 60 secondes avant un nouveau renouvellement.', 429);
    }
    const temporaryPassword = randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const changed = await this.prisma.user.updateMany({
      where: { id, gymId, actif: true, telephone: user.telephone, authVersion: user.authVersion, passwordRenewedAt: user.passwordRenewedAt },
      data: { ...clearRecovery, passwordHash, mustChangePassword: true, refreshTokenHash: null, passwordRenewedAt: new Date(), authVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new ConflictException('Compte modifié entre-temps. Rechargez sa fiche.');
    const whatsapp = await this.whatsapp.sendCredentials(telephone, user.email, temporaryPassword, user.prenom);
    return { user: publicStaffUser({ ...user, mustChangePassword: true }), whatsapp };
  }

  async toggle(gymId: string, id: string) {
    const user = (await this.findOne(gymId, id)) as any;
    const updated = await this.prisma.user.update({
      where: { id },
      data: { actif: !user.actif },
    });
    return this.omitPassword(updated);
  }

  async adminUpdate(gymId: string, id: string, dto: AdminUpdateUserDto) {
    await this.findOne(gymId, id);
    const data: Record<string, unknown> = {};
    if (dto.prenom !== undefined) data.prenom = dto.prenom;
    if (dto.nom !== undefined) data.nom = dto.nom;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.actif !== undefined) data.actif = dto.actif;
    if (dto.telephone !== undefined) {
      const telephone = staffPhone(dto.telephone);
      await this.assertPhoneAvailable(gymId, telephone, id);
      data.telephone = telephone;
      Object.assign(data, clearRecovery);
    }
    try {
      const user = await this.prisma.user.update({ where: { id }, data });
      return this.omitPassword(user);
    } catch (error) {
      if (phoneUniqueCollision(error)) throw new ConflictException('Ce numéro WhatsApp est déjà utilisé dans cette salle.');
      throw error;
    }
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { fcmToken } });
    return { message: 'Token FCM enregistré' };
  }

  async toggleById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    return this.omitPassword(
      await this.prisma.user.update({ where: { id }, data: { actif: !user.actif } })
    );
  }
}
