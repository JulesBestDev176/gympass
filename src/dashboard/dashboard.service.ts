import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnerStats(gymId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalMembers,
      activeMembers,
      newMembersMonth,
      revenuMois,
      nbPaiementsMois,
      abonnementsExpirantDemain,
      gerantsActifs,
      derniersPaiements,
    ] = await Promise.all([
      this.prisma.member.count({ where: { gymId } }),
      this.prisma.subscription.count({
        where: { member: { gymId }, statut: SubscriptionStatus.ACTIF },
      }),
      this.prisma.member.count({
        where: { gymId, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.payment.aggregate({
        where: { gymId, createdAt: { gte: startOfMonth } },
        _sum: { montantFcfa: true },
      }),
      this.prisma.payment.count({
        where: { gymId, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.subscription.count({
        where: {
          member: { gymId },
          statut: SubscriptionStatus.EXPIRE_DEMAIN,
        },
      }),
      this.prisma.user.count({
        where: { gymId, actif: true, role: 'GERANT' },
      }),
      this.prisma.payment.findMany({
        where: { gymId },
        include: { member: { select: { nom: true, prenom: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      adherentsActifs: activeMembers,
      totalAdherents: totalMembers,
      nouveauxMois: newMembersMonth,
      revenuMois: revenuMois._sum.montantFcfa ?? 0,
      nbPaiementsMois,
      abonnementsExpirantDemain,
      gerantsActifs,
      derniersPaiements,
    };
  }

  async getReceptionistStats(gymId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      nbEntreesAujourdhui,
      nbInscriptionsAujourdhui,
      nbPaiementsAujourdhui,
      abonnementsExpirantDemain,
    ] = await Promise.all([
      this.prisma.entry.count({
        where: { member: { gymId }, createdAt: { gte: startOfDay } },
      }),
      this.prisma.member.count({
        where: { gymId, createdAt: { gte: startOfDay } },
      }),
      this.prisma.payment.count({
        where: { gymId, createdAt: { gte: startOfDay } },
      }),
      this.prisma.subscription.count({
        where: {
          member: { gymId },
          statut: { in: [SubscriptionStatus.EXPIRE_DEMAIN] },
        },
      }),
    ]);

    return {
      nbEntreesAujourdhui,
      nbInscriptionsAujourdhui,
      nbPaiementsAujourdhui,
      abonnementsExpirantDemain,
    };
  }
}
