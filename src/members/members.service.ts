import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { SubscriptionStatus, NotifType } from '@prisma/client';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Génération numéro de carte ──────────────────────────────────────────────
  private async generateNumeroCarte(gymId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.member.count({ where: { gymId } });
    return `GP-${year}-${String(count + 1).padStart(3, '0')}`;
  }

  // ── Statut courant d'un member (basé sur sa subscription active) ─────────────
  static computeStatus(member: any): SubscriptionStatus {
    if (!member.carteActive) return SubscriptionStatus.CARTE_DESACTIVEE;

    // Trouver la subscription active la plus récente
    const subscriptions: any[] = member.subscriptions ?? [];
    if (!subscriptions.length) return SubscriptionStatus.EXPIRE;

    // Trier par dateExpiration desc
    const sorted = [...subscriptions].sort(
      (a, b) => new Date(b.dateExpiration).getTime() - new Date(a.dateExpiration).getTime(),
    );
    const active = sorted[0];

    if (active.formule === 'Séance') return active.statut;

    const now = new Date();
    const exp = new Date(active.dateExpiration);
    const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return SubscriptionStatus.EXPIRE;
    if (diffDays <= 1) return SubscriptionStatus.EXPIRE_DEMAIN;
    return SubscriptionStatus.ACTIF;
  }

  async findAll(gymId: string, search?: string) {
    const where: any = { gymId };
    if (search) {
      where.OR = [
        { nom: { contains: search, mode: 'insensitive' } },
        { prenom: { contains: search, mode: 'insensitive' } },
        { telephone: { contains: search } },
        { numeroCarte: { contains: search, mode: 'insensitive' } },
      ];
    }
    const members = await this.prisma.member.findMany({
      where,
      include: {
        subscriptions: { orderBy: { dateExpiration: 'desc' }, take: 1 },
        sessionCards: { where: { active: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    return members.map((m) => ({
      ...m,
      statut: MembersService.computeStatus(m),
    }));
  }

  async findOne(gymId: string, id: string) {
    const member = await this.prisma.member.findFirst({
      where: { id, gymId },
      include: {
        subscriptions: { orderBy: { dateExpiration: 'desc' } },
        sessionCards: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 10 },
        entries: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!member) throw new NotFoundException('Adhérent introuvable');
    return { ...member, statut: MembersService.computeStatus(member) };
  }

  async findByQr(qrCode: string) {
    const member = await this.prisma.member.findUnique({
      where: { qrCode },
      include: {
        subscriptions: { orderBy: { dateExpiration: 'desc' }, take: 1 },
        sessionCards: { where: { active: true }, take: 1 },
        gym: true,
      },
    });
    if (!member) throw new NotFoundException('QR code invalide');
    return { ...member, statut: MembersService.computeStatus(member) };
  }

  async create(gymId: string, userId: string, dto: CreateMemberDto) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');

    const numeroCarte = await this.generateNumeroCarte(gymId);
    const { paiement } = dto;
    const montantInscription = gym.fraisInscription;

    const member = await this.prisma.$transaction(async (tx) => {
      const m = await tx.member.create({
        data: {
          gymId,
          numeroCarte,
          qrCode: `GYMPASS-SN-${numeroCarte}`,
          nom: dto.nom,
          prenom: dto.prenom,
          telephone: dto.telephone,
          photoUrl: dto.photoUrl,
        },
      });

      // Seuls les frais d'inscription sont perçus à la création — la 1ère mensualité est payée le mois suivant
      await tx.payment.create({
        data: {
          gymId, memberId: m.id, userId,
          type: 'INSCRIPTION', formule: 'Inscription',
          montantFcfa: montantInscription,
          mode: paiement.mode, reference: paiement.reference, note: paiement.note,
        },
      });

      return m;
    });

    // Non-bloquant
    if (member.telephone) {
      this.scheduler.sendWelcome(member.telephone, member.prenom, member.nom, numeroCarte).catch(() => {});
    }
    this.notifications.createAndPush(
      gymId,
      'Nouvelle inscription',
      `${member.prenom} ${member.nom} — ${montantInscription.toLocaleString('fr-FR')} FCFA`,
      'INSCRIPTION' as any,
    ).catch(() => {});

    return { ...member, montantInscription };
  }

  async update(gymId: string, id: string, dto: UpdateMemberDto) {
    await this.findOne(gymId, id);
    return this.prisma.member.update({ where: { id }, data: dto });
  }

  async toggleCarte(gymId: string, id: string) {
    const member = await this.prisma.member.findFirst({ where: { id, gymId } });
    if (!member) throw new NotFoundException();
    return this.prisma.member.update({
      where: { id },
      data: { carteActive: !member.carteActive },
    });
  }

  async replaceCard(gymId: string, id: string, motif?: string) {
    const member = await this.prisma.member.findFirst({ where: { id, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable');

    const newNumeroCarte = await this.generateNumeroCarte(gymId);
    const newQrCode = `GYMPASS-SN-${newNumeroCarte}`;

    return this.prisma.member.update({
      where: { id },
      data: {
        numeroCarte: newNumeroCarte,
        qrCode: newQrCode,
        carteActive: true,
      },
    });
  }

  async getPaidMonths(gymId: string, memberId: string, annee: number): Promise<string[]> {
    const member = await this.prisma.member.findFirst({ where: { id: memberId, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable');
    const payments = await this.prisma.payment.findMany({
      where: {
        memberId,
        type: 'ABONNEMENT',
        moisCouvert: { startsWith: `${annee}-` },
      },
      select: { moisCouvert: true },
    });
    return payments.map((p) => p.moisCouvert!).filter(Boolean);
  }

  // Adhérents dont l'abonnement expire dans les prochains N jours
  async findExpiringSoon(gymId: string, days = 7) {
    const now = new Date();
    const limit = new Date(now.getTime() + days * 24 * 3600 * 1000);
    return this.prisma.subscription.findMany({
      where: {
        dateExpiration: { gte: now, lte: limit },
        member: { gymId },
        statut: { in: [SubscriptionStatus.ACTIF, SubscriptionStatus.EXPIRE_DEMAIN] },
      },
      include: { member: true },
      orderBy: { dateExpiration: 'asc' },
    });
  }
}
