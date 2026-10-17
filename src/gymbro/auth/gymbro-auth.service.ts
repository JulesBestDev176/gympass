import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { GymbroLoginDto } from './dto/login.dto';
import { GymbroInitRegisterDto, GymbroConfirmOtpDto } from './dto/register.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class GymbroAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
  ) {}

  private publicUser(user: any) {
    return {
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      telephone: user.telephone,
      actif: user.actif,
      phoneVerified: user.phoneVerified,
      role: user.role,
    };
  }

  private normalizePhone(tel: string): string {
    let p = tel.trim().replace(/[\s\-().]/g, '');
    if (!p.startsWith('+')) p = `+${p}`;
    return p;
  }

  private systemEmail(telephone: string): string {
    return `${telephone.replace(/\D/g, '')}@gymbro.sn`;
  }

  private generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async issueTokens(user: any) {
    const payload = { sub: user.id, app: 'gymbro' };
    const accessToken = await this.jwt.signAsync(
      { ...payload, tokenType: 'access' },
      { expiresIn: this.config.get('JWT_EXPIRES_IN', '15m') },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...payload, tokenType: 'refresh' },
      { expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '30d') },
    );
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.gymbroUser.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });
    return { accessToken, refreshToken };
  }

  // ─── ÉTAPE 1 : envoi OTP ────────────────────────────────────────────────────

  async initRegister(dto: GymbroInitRegisterDto) {
    const telephone = this.normalizePhone(dto.telephone);
    const existing = await this.prisma.gymbroUser.findUnique({ where: { telephone } });

    if (existing && existing.actif && existing.phoneVerified) {
      throw new ConflictException('Ce numéro est déjà associé à un compte.');
    }

    const otp = this.generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const email = this.systemEmail(telephone);

    if (existing) {
      await this.prisma.gymbroUser.update({
        where: { telephone },
        data: { prenom: dto.prenom, nom: dto.nom, passwordHash, otpCode: otp, otpExpiresAt },
      });
    } else {
      await this.prisma.gymbroUser.create({
        data: {
          email,
          passwordHash,
          prenom: dto.prenom,
          nom: dto.nom,
          telephone,
          actif: false,
          phoneVerified: false,
          otpCode: otp,
          otpExpiresAt,
          profile: { create: {} },
        },
      });
    }

    await this.whatsapp.sendGymbroOtp(telephone, otp, dto.prenom);
    return { message: `Code envoyé au ${telephone}` };
  }

  // ─── ÉTAPE 2 : confirmation OTP ─────────────────────────────────────────────

  async confirmOtp(dto: GymbroConfirmOtpDto) {
    const telephone = this.normalizePhone(dto.telephone);
    const user = await this.prisma.gymbroUser.findUnique({ where: { telephone } });

    if (!user) throw new BadRequestException('Numéro non reconnu.');
    if (!user.otpCode || !user.otpExpiresAt) {
      throw new BadRequestException('Aucun code en attente. Relance l\'inscription.');
    }
    if (new Date() > user.otpExpiresAt) {
      throw new BadRequestException('Code expiré. Relance l\'inscription.');
    }
    if (user.otpCode !== dto.otpCode) {
      throw new BadRequestException('Code incorrect.');
    }

    const updated = await this.prisma.gymbroUser.update({
      where: { telephone },
      data: { actif: true, phoneVerified: true, otpCode: null, otpExpiresAt: null },
    });

    const tokens = await this.issueTokens(updated);
    return { ...tokens, user: this.publicUser(updated) };
  }

  // ─── CONNEXION ───────────────────────────────────────────────────────────────

  async login(dto: GymbroLoginDto) {
    const telephone = this.normalizePhone(dto.telephone);
    const user = await this.prisma.gymbroUser.findUnique({ where: { telephone } });

    if (!user) throw new UnauthorizedException('Numéro ou mot de passe incorrect.');
    if (!user.actif) throw new UnauthorizedException('Compte non activé. Vérifie ton numéro.');
    if (!user.phoneVerified) throw new UnauthorizedException('Numéro non vérifié. Finalise ton inscription.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Numéro ou mot de passe incorrect.');

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  // ─── RENVOI OTP ──────────────────────────────────────────────────────────────

  async resendOtp(telephone: string) {
    const tel = this.normalizePhone(telephone);
    const user = await this.prisma.gymbroUser.findUnique({ where: { telephone: tel } });

    if (!user) throw new BadRequestException('Numéro non reconnu.');
    if (user.phoneVerified) throw new BadRequestException('Numéro déjà vérifié.');

    const otp = this.generateOtp();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.prisma.gymbroUser.update({
      where: { telephone: tel },
      data: { otpCode: otp, otpExpiresAt },
    });

    await this.whatsapp.sendGymbroOtp(tel, otp, user.prenom);
    return { message: `Nouveau code envoyé au ${tel}` };
  }

  // ─── REFRESH ─────────────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token manquant');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expirée');
    }

    if (payload.tokenType !== 'refresh' || payload.app !== 'gymbro') {
      throw new UnauthorizedException('Token invalide');
    }

    const user = await this.prisma.gymbroUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.actif || !user.refreshTokenHash) throw new UnauthorizedException('Session expirée');

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Session expirée');

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  async me(userId: string) {
    const user = await this.prisma.gymbroUser.findUnique({
      where: { id: userId },
      include: { profile: true, subscriptions: { where: { statut: 'ACTIVE' }, take: 1 } },
    });
    if (!user || !user.actif) throw new UnauthorizedException('Compte inactif ou introuvable');
    return {
      user: this.publicUser(user),
      profile: user.profile,
      hasActiveSubscription: user.subscriptions.length > 0,
    };
  }

  async logout(userId: string) {
    await this.prisma.gymbroUser.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { message: 'Déconnexion réussie' };
  }
}
