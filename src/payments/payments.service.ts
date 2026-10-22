import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentReceiptService } from './payment-receipt.service';
import { PaymentReceiptData, receiptData } from './payment-receipt.data';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaymentType, SubscriptionStatus, NotifType, UserRole } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly receipts: PaymentReceiptService,
  ) {}

  async findAll(
    gymId: string, userId: string, role: UserRole,
    memberId?: string, dateDebut?: string, dateFin?: string,
  ) {
    const where: any = { gymId };

    if (role === UserRole.GERANT) {
      // Le gérant voit uniquement ses propres paiements de la semaine courante
      where.userId = userId;
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      where.createdAt = { gte: monday, lte: sunday };
    } else {
      // Admin peut filtrer par plage de dates
      if (dateDebut || dateFin) {
        where.createdAt = {};
        if (dateDebut) where.createdAt.gte = new Date(dateDebut);
        if (dateFin) {
          const fin = new Date(dateFin);
          fin.setHours(23, 59, 59, 999);
          where.createdAt.lte = fin;
        }
      }
    }

    if (memberId) where.memberId = memberId;

    return this.prisma.payment.findMany({
      where,
      include: {
        member: true,
        user: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private replay(existing: any, userId: string, dto: CreatePaymentDto) {
    const data = existing.receiptData as PaymentReceiptData | null;
    if (existing.userId !== userId || existing.memberId !== dto.memberId || existing.type !== dto.type
      || existing.mode !== dto.mode || (existing.moisCouvert || null) !== (dto.moisCouvert || null)
      || (existing.reference || '') !== (dto.reference || '')
      || (dto.type === 'RECHARGE_CARTE' && data?.quantity !== dto.nbSeances)
      || (dto.montantOverride != null && dto.montantOverride !== existing.montantFcfa)) {
      throw new ConflictException('Cette demande correspond déjà à un autre paiement.');
    }
    return existing;
  }

  async create(gymId: string, userId: string, dto: CreatePaymentDto) {
    const include = { member: true, user: { select: { id: true, nom: true, prenom: true } } };
    if (dto.requestId) {
      const existing = await this.prisma.payment.findFirst({ where: { gymId, requestId: dto.requestId }, include });
      if (existing) return this.replay(existing, userId, dto);
    }
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');
    const member = await this.prisma.member.findFirst({ where: { id: dto.memberId, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable');
    const collector = await this.prisma.user.findFirst({ where: { id: userId, gymId }, select: { prenom: true, nom: true } });
    if (!collector) throw new NotFoundException('Personnel introuvable');
    let payment: any;
    try {
      payment = await this.prisma.$transaction(async tx => {
        let formule: string, amount: number;
        let sessionCardId: string | undefined;
        let details: Partial<PaymentReceiptData> = {};
        switch (dto.type) {
          case PaymentType.ABONNEMENT: {
            if (!dto.moisCouvert || !/^\d{4}-(0[1-9]|1[0-2])$/.test(dto.moisCouvert))
              throw new BadRequestException('Choisissez le mois couvert (YYYY-MM).');
            const [year, month] = dto.moisCouvert.split('-').map(Number);
            if (year < 2000) throw new BadRequestException('Mois invalide.');
            if (await tx.payment.findFirst({ where: { memberId: member.id, moisCouvert: dto.moisCouvert } }))
              throw new BadRequestException('Cette mensualité est déjà enregistrée.');
            formule = 'Mensuel'; amount = dto.montantOverride ?? gym.prixMensualite;
            break;
          }
          case PaymentType.RECHARGE_CARTE: {
            if (!dto.nbSeances) throw new BadRequestException('nbSeances requis pour une recharge');
            // Serialize a member's first card creation on the legacy production schema.
            await tx.$queryRaw`SELECT id FROM members WHERE id = ${member.id} AND "gymId" = ${gymId} FOR UPDATE`;
            const candidates = await tx.sessionCard.findMany({ where: { memberId: member.id,
              ...(dto.sessionCardId ? { id: dto.sessionCardId } : { active: true }) }, take: 2 });
            if (candidates.length > 1) throw new BadRequestException('Plusieurs cartes de séances actives existent. Faites vérifier la fiche avant de recharger.');
            if (dto.sessionCardId && candidates.length === 0) throw new NotFoundException('Carte séances introuvable');
            const existingCard = candidates[0];
            if (existingCard && !existingCard.active) throw new BadRequestException('Cette carte de séances est désactivée.');
            const cardId = randomUUID();
            const card = existingCard
              ? await tx.sessionCard.update({ where: { id: existingCard.id }, data: {
                  seancesRestantes: { increment: dto.nbSeances }, seancesTotal: { increment: dto.nbSeances } } })
              : await tx.sessionCard.create({ data: { id: cardId, memberId: member.id,
                  qrCode: `GYMPASS-CARTE-${cardId}`, seancesRestantes: dto.nbSeances, seancesTotal: dto.nbSeances, active: true } });
            sessionCardId = card.id;
            details = { quantity: dto.nbSeances, balanceBefore: card.seancesRestantes - dto.nbSeances, balanceAfter: card.seancesRestantes };
            await tx.subscription.updateMany({ where: { memberId: member.id, formule: 'Séance' }, data: { statut: SubscriptionStatus.SEANCE_DISPONIBLE } });
            formule = 'Recharge carte'; amount = dto.nbSeances * gym.prixSeance;
            break;
          }
          case PaymentType.INSCRIPTION:
            if (await tx.payment.findFirst({ where: { memberId: member.id, type: 'INSCRIPTION' } }))
              throw new BadRequestException("Les frais d'inscription ont déjà été enregistrés.");
            formule = 'Inscription'; amount = dto.montantOverride ?? gym.fraisInscription; break;
          case PaymentType.SEANCE_UNIQUE:
            formule = 'Séance unique'; amount = gym.prixSeance; break;
          default: throw new BadRequestException('Type de paiement invalide');
        }
        const record = await tx.payment.create({ data: {
          gymId, memberId: member.id, userId, type: dto.type, formule, montantFcfa: amount,
          mode: dto.mode, reference: dto.reference, note: dto.note, sessionCardId,
          requestId: dto.requestId, moisCouvert: dto.type === 'ABONNEMENT' ? dto.moisCouvert : null,
          receiptWhatsappStatus: 'queued',
        } });
        if (dto.type === 'ABONNEMENT') {
          const [year, month] = dto.moisCouvert!.split('-').map(Number);
          await tx.subscription.create({ data: { memberId: member.id, formule: 'Mensuel',
            dateDebut: new Date(Date.UTC(year, month - 1, 1)),
            dateExpiration: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)), statut: SubscriptionStatus.ACTIF } });
        }
        const snapshot = receiptData(record, gym, member, `${collector.prenom} ${collector.nom}`, details);
        return tx.payment.update({ where: { id: record.id }, data: { receiptData: snapshot as any }, include });
      });
    } catch (error) {
      if (dto.requestId) {
        const existing = await this.prisma.payment.findFirst({ where: { gymId, requestId: dto.requestId }, include });
        if (existing) return this.replay(existing, userId, dto);
      }
      if ((error as any)?.code === 'P2002') throw new ConflictException('Cette mensualité est déjà enregistrée.');
      throw error;
    }
    this.notifications.createAndPush(gymId, 'Paiement enregistré',
      `${member.prenom} ${member.nom} — ${payment.montantFcfa.toLocaleString('fr-FR')} FCFA (${payment.formule})`, NotifType.PAIEMENT).catch(() => {});
    // Only the receipt is sent: no separate legacy text confirmation.
    void this.receipts.deliver(payment.id).catch(() => {});
    return payment;
  }

  async getStats(gymId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalMonth, totalToday, countMonth] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { gymId, createdAt: { gte: startOfMonth } },
        _sum: { montantFcfa: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          gymId,
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
        _sum: { montantFcfa: true },
      }),
      this.prisma.payment.count({
        where: { gymId, createdAt: { gte: startOfMonth } },
      }),
    ]);

    return {
      revenuMois: totalMonth._sum.montantFcfa ?? 0,
      revenuAujourdhui: totalToday._sum.montantFcfa ?? 0,
      nbPaiementsMois: countMonth,
    };
  }
}
