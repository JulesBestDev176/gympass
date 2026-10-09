import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { gym: true },
    });

    if (!user) throw new UnauthorizedException('Email ou mot de passe incorrect');
    if (!user.actif) throw new UnauthorizedException('Compte désactivé');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Email ou mot de passe incorrect');

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      gymId: user.gymId,
    };
    const token = this.jwt.sign(payload);

    return {
      accessToken: token,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        photoUrl: user.photoUrl,
        gym: {
          id: user.gym.id,
          nom: user.gym.nom,
          slug: user.gym.slug,
        },
      },
    };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Ancien mot de passe incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    return { message: 'Mot de passe mis à jour avec succès' };
  }

  // Appelé à la première connexion (forçage changement mot de passe)
  async forceChangePassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.mustChangePassword) {
      throw new BadRequestException('Changement de mot de passe non requis');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    return { message: 'Mot de passe défini avec succès' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // On ne révèle pas si l'email existe ou non
    if (!user || !user.telephone) {
      return { message: 'Si cet email existe, un OTP a été envoyé sur WhatsApp.' };
    }

    const otp = generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpiresAt },
    });

    await this.whatsapp.sendOtp(user.telephone, otp, user.prenom);

    return { message: 'Si cet email existe, un OTP a été envoyé sur WhatsApp.' };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('OTP invalide ou expiré');

    if (
      !user.otpCode ||
      !user.otpExpiresAt ||
      user.otpCode !== otp ||
      new Date() > user.otpExpiresAt
    ) {
      throw new BadRequestException('OTP invalide ou expiré');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, otpCode: null, otpExpiresAt: null, mustChangePassword: false },
    });

    return { message: 'Mot de passe réinitialisé avec succès' };
  }
}
