import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { clearRecovery, tokenDigest, validateNewPassword } from './password-security';

const GENERIC = { message: 'Si cet email correspond à un compte actif, un code sera envoyé au numéro WhatsApp enregistré.' };
const invalid = () => new BadRequestException('Code ou autorisation invalide, expiré ou déjà utilisé.');

@Injectable()
export class PasswordRecoveryService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly whatsapp: WhatsappService) {}

  private find(email: string) {
    return this.prisma.user.findFirst({ where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } } });
  }

  private digest(id: string, code: string) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('Recovery signing key unavailable');
    return createHmac('sha256', secret).update(`gympass-password-reset:${id}:${code}`).digest('hex');
  }

  async request(email: string) {
    const user = await this.find(email);
    if (!user?.actif || !/^\+2217[05678]\d{7}$/.test(user.telephone ?? '')) return GENERIC;
    const now = new Date();
    if (user.otpRequestedAt && now.getTime() - user.otpRequestedAt.getTime() < 60000) return GENERIC;
    const sameWindow = user.otpWindowStartedAt && now.getTime() - user.otpWindowStartedAt.getTime() < 3600000;
    if (sameWindow && user.otpRequests >= 5) return GENERIC;
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const digest = this.digest(user.id, code);
    const reserved = await this.prisma.user.updateMany({
      where: { id: user.id, actif: true, telephone: user.telephone, otpRequestedAt: user.otpRequestedAt, otpRequests: user.otpRequests, authVersion: user.authVersion },
      data: { ...clearRecovery, otpCode: digest, otpExpiresAt: new Date(+now + 600000), otpRequestedAt: now,
        otpWindowStartedAt: sameWindow ? user.otpWindowStartedAt : now, otpRequests: sameWindow ? user.otpRequests + 1 : 1 },
    });
    if (reserved.count === 1) {
      // Delivery happens after the response, preventing account enumeration by
      // Relayio network latency. No plaintext code is stored in the database.
      setImmediate(() => { void this.deliver(user, code, digest); });
    }
    return GENERIC;
  }

  private async deliver(user: { id: string; telephone: string | null; prenom: string }, code: string, digest: string) {
    try {
      const delivery = await this.whatsapp.sendOtp(user.telephone!, code, user.prenom);
      if (delivery.status === 'accepted') return;
    } catch { /* Never log codes, tokens or provider request contents. */ }
    try { await this.prisma.user.updateMany({ where: { id: user.id, otpCode: digest }, data: { otpCode: null, otpExpiresAt: null } }); } catch { /* An expired unsent code cannot grant access. */ }
  }

  async verify(email: string, code: string) {
    if (!/^\d{6}$/.test(code)) throw invalid();
    const user = await this.find(email);
    const now = new Date();
    if (!user?.actif || !user.otpCode || !/^[a-f0-9]{64}$/.test(user.otpCode) || !user.otpExpiresAt || user.otpExpiresAt <= now || user.otpAttempts >= 5) throw invalid();
    // Reserve an attempt before comparing; parallel guesses cannot bypass the cap.
    const attempt = await this.prisma.user.updateMany({
      where: { id: user.id, actif: true, otpCode: user.otpCode, otpExpiresAt: { gt: now }, otpAttempts: user.otpAttempts, authVersion: user.authVersion },
      data: { otpAttempts: { increment: 1 } },
    });
    if (attempt.count !== 1 || !timingSafeEqual(Buffer.from(user.otpCode, 'hex'), Buffer.from(this.digest(user.id, code), 'hex'))) throw invalid();
    const resetToken = randomBytes(32).toString('base64url');
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, actif: true, otpCode: user.otpCode, otpAttempts: user.otpAttempts + 1, otpExpiresAt: { gt: new Date() }, authVersion: user.authVersion },
      data: { otpCode: null, otpExpiresAt: null, passwordResetTokenHash: tokenDigest(resetToken), passwordResetExpiresAt: new Date(Date.now() + 300000) },
    });
    if (claimed.count !== 1) throw invalid();
    return { resetToken, expiresIn: 300 };
  }

  async complete(email: string, resetToken: string, password: string, confirmation: string) {
    validateNewPassword(password, confirmation);
    if (typeof confirmation !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(resetToken)) throw invalid();
    const user = await this.find(email);
    if (!user?.actif || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date() || user.passwordResetTokenHash !== tokenDigest(resetToken)) throw invalid();
    const passwordHash = await bcrypt.hash(password, 12);
    const changed = await this.prisma.user.updateMany({
      where: { id: user.id, actif: true, passwordResetTokenHash: user.passwordResetTokenHash, passwordResetExpiresAt: { gt: new Date() }, authVersion: user.authVersion },
      data: { ...clearRecovery, passwordHash, mustChangePassword: false, refreshTokenHash: null, authVersion: { increment: 1 }, passwordRenewedAt: new Date() },
    });
    if (changed.count !== 1) throw invalid();
    const updated = await this.prisma.user.findUnique({ where: { id: user.id }, include: { gym: true } });
    if (!updated?.actif || updated.authVersion !== user.authVersion + 1) throw invalid();
    return updated;
  }
}
