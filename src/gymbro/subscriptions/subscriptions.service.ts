import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Utilisateur ─────────────────────────────────────────────────────────────

  async getMySubscription(userId: string) {
    const sub = await this.prisma.gymbroSubscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { hasSubscription: false };

    const now = new Date();
    const isActive = sub.statut === 'ACTIVE' && sub.dateExpiration > now;
    const isReadOnly =
      sub.statut === 'EXPIRED' && sub.readOnlyUntil && sub.readOnlyUntil > now;

    return {
      hasSubscription: true,
      isActive,
      isReadOnly: !isActive && isReadOnly,
      subscription: sub,
      daysLeft: isActive
        ? Math.ceil((sub.dateExpiration.getTime() - now.getTime()) / 86400000)
        : 0,
    };
  }

  async cancel(userId: string, subscriptionId: string) {
    const sub = await this.prisma.gymbroSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Abonnement introuvable');
    if (sub.userId !== userId) throw new ForbiddenException();
    if (sub.statut !== 'ACTIVE') throw new ForbiddenException('Abonnement déjà annulé ou expiré');

    const readOnlyUntil = new Date(sub.dateExpiration);
    readOnlyUntil.setDate(readOnlyUntil.getDate() + 30);

    return this.prisma.gymbroSubscription.update({
      where: { id: subscriptionId },
      data: { statut: 'CANCELLED', readOnlyUntil },
    });
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  async create(dto: CreateSubscriptionDto, adminId: string) {
    const user = await this.prisma.gymbroUser.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Utilisateur GymBro introuvable');

    // Désactiver l'abonnement actif si existant
    await this.prisma.gymbroSubscription.updateMany({
      where: { userId: dto.userId, statut: 'ACTIVE' },
      data: { statut: 'CANCELLED' },
    });

    return this.prisma.gymbroSubscription.create({
      data: {
        userId: dto.userId,
        dateExpiration: new Date(dto.dateExpiration),
        montantFcfa: dto.montantFcfa,
        statut: 'ACTIVE',
        createdById: adminId,
        note: dto.note,
      },
    });
  }

  async findAll(status?: string) {
    return this.prisma.gymbroSubscription.findMany({
      where: status ? { statut: status as any } : {},
      include: { user: { select: { id: true, prenom: true, nom: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── CRON ────────────────────────────────────────────────────────────────────

  // Chaque jour à 9h : expirer les abonnements dépassés
  @Cron('0 9 * * *')
  async expireSubscriptions() {
    const now = new Date();
    const expired = await this.prisma.gymbroSubscription.findMany({
      where: { statut: 'ACTIVE', dateExpiration: { lt: now } },
    });

    for (const sub of expired) {
      const readOnlyUntil = new Date(sub.dateExpiration);
      readOnlyUntil.setDate(readOnlyUntil.getDate() + 30);
      await this.prisma.gymbroSubscription.update({
        where: { id: sub.id },
        data: { statut: 'EXPIRED', readOnlyUntil },
      });
    }

    if (expired.length > 0) {
      console.log(`[GymBro] ${expired.length} abonnement(s) expiré(s)`);
    }
  }

  // Chaque jour à 9h : notifier les abonnements qui expirent dans 3 jours
  @Cron('0 9 * * *')
  async notifyExpiringSoon() {
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);
    const today = new Date();

    const expiringSoon = await this.prisma.gymbroSubscription.findMany({
      where: {
        statut: 'ACTIVE',
        dateExpiration: { gte: today, lte: in3days },
      },
      include: { user: true },
    });

    for (const sub of expiringSoon) {
      await this.prisma.gymbroNotification.create({
        data: {
          userId: sub.userId,
          titre: 'Abonnement bientôt expiré',
          message: `Votre abonnement expire le ${sub.dateExpiration.toLocaleDateString('fr-FR')}. Renouvelez pour continuer votre programme.`,
          type: 'ABONNEMENT',
        },
      });
    }
  }
}
