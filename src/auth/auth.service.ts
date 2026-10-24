import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { randomUUID, timingSafeEqual } from 'crypto';
import { PasswordRecoveryService } from './password-recovery.service';
import { clearRecovery, tokenDigest, validateNewPassword } from './password-security';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly recovery: PasswordRecoveryService,
  ) {}

  private publicUser(user: any) {
    return {
      id: user.id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      role: user.role,
      actif: user.actif,
      mustChangePassword: user.mustChangePassword,
      photoUrl: user.photoUrl,
      gymId: user.gymId,
      gym: {
        id: user.gym.id,
        nom: user.gym.nom,
        slug: user.gym.slug,
      },
    };
  }

  private async issueTokens(user: any, rotation?: { id: string; digest: string }, legacyDigest?: string) {
    const sessionId = rotation?.id ?? randomUUID();
    const payload = {
      sid: sessionId,
      sub: user.id,
      email: user.email,
      role: user.role,
      gymId: user.gymId,
      authVersion: user.authVersion ?? 0,
    };
    const accessToken = await this.jwt.signAsync(
      { ...payload, tokenType: 'access', jti: randomUUID() },
      { expiresIn: this.config.get('JWT_EXPIRES_IN', '15m') },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...payload, tokenType: 'refresh', jti: randomUUID() },
      { expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '30d') },
    );
    const refreshTokenHash = `sha256:${tokenDigest(refreshToken)}`;
    const expiresAt = new Date((this.jwt.decode(refreshToken) as { exp: number }).exp * 1000);
    await this.prisma.$transaction(async tx => {
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current?.actif || current.authVersion !== (user.authVersion ?? 0)) {
        throw new UnauthorizedException('Session revoked');
      }
      if (rotation) {
        const changed = await tx.authSession.updateMany({
          where: { id: rotation.id, userId: user.id, refreshTokenHash: rotation.digest, expiresAt: { gt: new Date() } },
          data: { refreshTokenHash, expiresAt },
        });
        if (changed.count !== 1) throw new UnauthorizedException('Session expirée');
      } else {
        if (legacyDigest) {
          const consumed = await tx.user.updateMany({
            where: { id: user.id, actif: true, authVersion: user.authVersion ?? 0, refreshTokenHash: legacyDigest },
            data: { refreshTokenHash: null },
          });
          if (consumed.count !== 1) throw new UnauthorizedException('Session expirée');
        }
        await tx.authSession.create({ data: { id: sessionId, userId: user.id, refreshTokenHash, expiresAt } });
        await tx.authSession.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
      }
    });
    return { accessToken, refreshToken };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: { gym: true },
    });

    if (!user) throw new UnauthorizedException('Email ou mot de passe incorrect');
    if (!user.actif) throw new UnauthorizedException('Compte désactivé');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Email ou mot de passe incorrect');

    const tokens = await this.issueTokens(user);

    return {
      ...tokens,
      mustChangePassword: user.mustChangePassword,
      user: this.publicUser(user),
    };
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

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Token invalide');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { gym: true },
    });
    if (!user || !user.actif) {
      throw new UnauthorizedException('Session expirée');
    }

    if ((payload.authVersion ?? 0) !== (user.authVersion ?? 0)) throw new UnauthorizedException('Session revoked');
    const digest = `sha256:${tokenDigest(refreshToken)}`;
    if (typeof payload.sid === 'string' && payload.sid.length > 0) {
      const tokens = await this.issueTokens(user, { id: payload.sid, digest });
      return { ...tokens, mustChangePassword: user.mustChangePassword, user: this.publicUser(user) };
    }
    if (!user.refreshTokenHash) throw new UnauthorizedException('Session expirée');
    const valid = user.refreshTokenHash.startsWith('sha256:')
      ? user.refreshTokenHash.length === digest.length && timingSafeEqual(Buffer.from(user.refreshTokenHash), Buffer.from(digest))
      : (user.authVersion ?? 0) === 0 && await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Session expirée');

    const tokens = await this.issueTokens(user, undefined, user.refreshTokenHash);
    return {
      ...tokens,
      mustChangePassword: user.mustChangePassword,
      user: this.publicUser(user),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { gym: true },
    });
    if (!user || !user.actif) throw new UnauthorizedException('Compte inactif ou introuvable');
    return {
      mustChangePassword: user.mustChangePassword,
      user: this.publicUser(user),
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, authVersion: { increment: 1 }, fcmToken: null },
    });
    return { message: 'Déconnexion réussie' };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    validateNewPassword(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Ancien mot de passe incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const changed = await this.prisma.user.updateMany({
      where: { id: userId, actif: true, passwordHash: user.passwordHash, authVersion: user.authVersion },
      data: { ...clearRecovery, passwordHash, mustChangePassword: false, refreshTokenHash: null, authVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new UnauthorizedException('Session revoked');
    return this.sessionFor(userId, (user.authVersion ?? 0) + 1);
  }

  // Appelé à la première connexion (forçage changement mot de passe)
  async forceChangePassword(userId: string, newPassword: string) {
    validateNewPassword(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.mustChangePassword) {
      throw new BadRequestException('Changement de mot de passe non requis');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const changed = await this.prisma.user.updateMany({
      where: { id: userId, actif: true, passwordHash: user.passwordHash, authVersion: user.authVersion },
      data: { ...clearRecovery, passwordHash, mustChangePassword: false, refreshTokenHash: null, authVersion: { increment: 1 } },
    });
    if (changed.count !== 1) throw new UnauthorizedException('Session revoked');
    return this.sessionFor(userId, (user.authVersion ?? 0) + 1);
  }

  private async sessionFor(userId: string, expectedVersion: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { gym: true } });
    if (!user?.actif || user.authVersion !== expectedVersion) throw new UnauthorizedException('Session revoked');
    return { ...await this.issueTokens(user), mustChangePassword: user.mustChangePassword, user: this.publicUser(user) };
  }

  forgotPassword(email: string) { return this.recovery.request(email); }
  verifyResetOtp(email: string, otp: string) { return this.recovery.verify(email, otp); }
  async resetPassword(email: string, resetToken: string, newPassword: string, confirmation: string) {
    const user = await this.recovery.complete(email, resetToken, newPassword, confirmation);
    return this.sessionFor(user!.id, user!.authVersion);
  }
}
