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

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalMembers,
      activeMembers,
      newMembersMonth,
      revenuMois,
      nbPaiementsMois,
      abonnementsExpirantDemain,
      gerantsActifs,
      derniersPaiements,
      entreesAujourdhui,
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
      this.prisma.entry.count({
        where: { member: { gymId }, createdAt: { gte: startOfDay } },
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
      entreesAujourdhui,
    };
  }

  async getGlobalStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 6 derniers mois
    const months: { label: string; gte: Date; lte: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      months.push({
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        gte: d,
        lte: end,
      });
    }

    const [
      nbGyms,
      nbAdherents,
      revenuMois,
      nbEntreesAujourdhui,
      gymsForRanking,
    ] = await Promise.all([
      this.prisma.gym.count(),
      this.prisma.member.count(),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { montantFcfa: true },
      }),
      this.prisma.entry.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.gym.findMany({
        select: { id: true, nom: true, slug: true },
      }),
    ]);

    // Revenus par salle sur 6 mois
    const revenuePerGymPerMonth = await Promise.all(
      gymsForRanking.map(async (g) => {
        const monthly = await Promise.all(
          months.map((m) =>
            this.prisma.payment.aggregate({
              where: { gymId: g.id, createdAt: { gte: m.gte, lte: m.lte } },
              _sum: { montantFcfa: true },
            }),
          ),
        );
        const totalMois = monthly[monthly.length - 1]._sum.montantFcfa ?? 0;
        return {
          gymId: g.id,
          gymNom: g.nom,
          monthly: monthly.map((m, i) => ({
            label: months[i].label,
            revenu: m._sum.montantFcfa ?? 0,
          })),
          revenuMois: totalMois,
        };
      }),
    );

    const top5 = [...revenuePerGymPerMonth]
      .sort((a, b) => b.revenuMois - a.revenuMois)
      .slice(0, 5);

    // Graphe : revenus globaux par mois
    const revenueChart = await Promise.all(
      months.map(async (m) => {
        const agg = await this.prisma.payment.aggregate({
          where: { createdAt: { gte: m.gte, lte: m.lte } },
          _sum: { montantFcfa: true },
        });
        return { label: m.label, revenu: agg._sum.montantFcfa ?? 0 };
      }),
    );

    return {
      nbGyms,
      nbAdherents,
      revenuMois: revenuMois._sum.montantFcfa ?? 0,
      nbEntreesAujourdhui,
      revenueChart,
      top5Gyms: top5,
      revenuePerGym: revenuePerGymPerMonth,
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
