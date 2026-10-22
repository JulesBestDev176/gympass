import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaymentType, SubscriptionStatus, NotifType, UserRole } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerService,
  ) {}

  async findAll(gymId: string, userId: string, role: UserRole, memberId?: string) {
    const where: any = { gymId };

    if (role === UserRole.GERANT) {
      // Le gérant voit uniquement ses propres paiements de la semaine courante
      where.userId = userId;
      const now = new Date();
      const day = now.getDay(); // 0=dimanche, 1=lundi ...
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      where.createdAt = { gte: monday, lte: sunday };
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

  async create(gymId: string, userId: string, dto: CreatePaymentDto) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');

    const member = await this.prisma.member.findFirst({ where: { id: dto.memberId, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable');

    let formule: string;
    let montantFcfa: number;
    let extraData: any = {};

    switch (dto.type) {
      // ── Abonnement mensuel ──────────────────────────────────────────────────
      case PaymentType.ABONNEMENT: {
        if (!dto.moisCouvert || !/^\d{4}-(0[1-9]|1[0-2])$/.test(dto.moisCouvert))
          throw new BadRequestException('Choisissez le mois couvert (YYYY-MM).');
        const [year, month] = dto.moisCouvert.split('-').map(Number);
        const dateDebut = new Date(Date.UTC(year, month - 1, 1));
        const dateExpiration = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        const amount = dto.montantOverride ?? gym.prixMensualite;
        let payment;
        try {
          payment = await this.prisma.$transaction(async tx => {
            if (await tx.payment.findFirst({ where: { memberId: member.id, moisCouvert: dto.moisCouvert } }))
              throw new BadRequestException('Cette mensualité est déjà enregistrée.');
            // Unique payment first: a competing request cannot create a subscription or notify.
            const record = await tx.payment.create({ data: {
              gymId, memberId: member.id, userId, type: 'ABONNEMENT', formule: 'Mensuel',
              montantFcfa: amount, mode: dto.mode, reference: dto.reference, note: dto.note,
              moisCouvert: dto.moisCouvert,
            }, include: { member: true } });
            await tx.subscription.create({ data: { memberId: member.id, formule: 'Mensuel',
              dateDebut, dateExpiration, statut: SubscriptionStatus.ACTIF } });
            return record;
          });
        } catch (error) {
          if ((error as any)?.code === 'P2002') throw new BadRequestException('Cette mensualité est déjà enregistrée.');
          throw error;
        }
        this.notifications.createAndPush(gymId, 'Paiement enregistré',
          `${member.prenom} ${member.nom} — ${amount.toLocaleString('fr-FR')} FCFA (Mensuel ${dto.moisCouvert})`, NotifType.PAIEMENT).catch(() => {});
        if (member.telephone) this.scheduler.sendPaymentConfirmation(member.telephone, member.prenom,
          member.nom, amount, `Mensuel ${dto.moisCouvert}`, dateExpiration).catch(() => {});
        return payment;
      }

      case PaymentType.SEANCE_UNIQUE: {
        formule = 'Séance unique';
        montantFcfa = gym.prixSeance;

        // WhatsApp confirmation — non-bloquant
        if (member.telephone) {
          this.scheduler.sendPaymentConfirmation(
            member.telephone, member.prenom, member.nom, gym.prixSeance, formule,
          ).catch(() => {});
        }
        break;
      }

      // ── Frais d'inscription ─────────────────────────────────────────────────
      case PaymentType.INSCRIPTION: {
        if (await this.prisma.payment.findFirst({ where: { memberId: member.id, type: 'INSCRIPTION' } }))
          throw new BadRequestException("Les frais d'inscription ont déjà été enregistrés.");
        formule = 'Inscription';
        montantFcfa = dto.montantOverride ?? gym.fraisInscription;
        this.notifications.createAndPush(
          gymId,
          'Nouvelle inscription',
          `${member.prenom} ${member.nom} — ${montantFcfa.toLocaleString('fr-FR')} FCFA`,
          NotifType.INSCRIPTION,
        ).catch(() => { /* silently ignored */ });
        break;
      }

      // ── Recharge carte séances ──────────────────────────────────────────────
      case PaymentType.RECHARGE_CARTE: {
        if (!dto.sessionCardId || !dto.nbSeances)
          throw new BadRequestException('sessionCardId et nbSeances requis pour une recharge');

        const card = await this.prisma.sessionCard.findFirst({
          where: { id: dto.sessionCardId, memberId: member.id },
        });
        if (!card) throw new NotFoundException('Carte séances introuvable');

        formule = 'Recharge carte';
        montantFcfa = dto.nbSeances * gym.prixSeance;

        await this.prisma.sessionCard.update({
          where: { id: card.id },
          data: {
            seancesRestantes: card.seancesRestantes + dto.nbSeances,
            seancesTotal: card.seancesTotal + dto.nbSeances,
          },
        });

        await this.prisma.subscription.updateMany({
          where: { memberId: member.id, formule: 'Séance' },
          data: { statut: SubscriptionStatus.SEANCE_DISPONIBLE },
        });

        extraData = { sessionCardId: card.id };

        // WhatsApp confirmation — non-bloquant
        if (member.telephone) {
          this.scheduler.sendPaymentConfirmation(
            member.telephone, member.prenom, member.nom, montantFcfa, formule,
          ).catch(() => {});
        }
        break;
      }

      default:
        throw new BadRequestException('Type de paiement invalide');
    }

    return this.prisma.payment.create({
      data: {
        gymId,
        memberId: member.id,
        userId,
        type: dto.type,
        formule,
        montantFcfa,
        mode: dto.mode,
        reference: dto.reference,
        note: dto.note,
        ...extraData,
      },
      include: { member: true },
    });
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
