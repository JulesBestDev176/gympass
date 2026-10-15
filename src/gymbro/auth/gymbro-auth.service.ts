import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GymbroRegisterDto } from './dto/register.dto';
import { GymbroLoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class GymbroAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private publicUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      prenom: user.prenom,
      nom: user.nom,
      telephone: user.telephone,
      actif: user.actif,
    };
  }

  private async issueTokens(user: any) {
    const payload = { sub: user.id, email: user.email, app: 'gymbro' };

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

  async register(dto: GymbroRegisterDto) {
    const existing = await this.prisma.gymbroUser.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email déjà utilisé');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.gymbroUser.create({
      data: {
        email: dto.email,
        passwordHash,
        prenom: dto.prenom,
        nom: dto.nom,
        telephone: dto.telephone,
        // Créer le profil questionnaire vide
        profile: { create: {} },
      },
    });

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

  async login(dto: GymbroLoginDto) {
    const user = await this.prisma.gymbroUser.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Email ou mot de passe incorrect');
    if (!user.actif) throw new UnauthorizedException('Compte désactivé');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Email ou mot de passe incorrect');

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.publicUser(user) };
  }

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
