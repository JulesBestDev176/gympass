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
        if (!dto.moisCouvert) throw new BadRequestException('moisCouvert requis pour une mensualité (format YYYY-MM)');

        // Un seul paiement par mois/membre
        const doublon = await this.prisma.payment.findFirst({
          where: { memberId: member.id, moisCouvert: dto.moisCouvert },
        });
        if (doublon) throw new BadRequestException(`Mensualité ${dto.moisCouvert} déjà enregistrée pour cet adhérent.`);

        formule = 'Mensuel';
        montantFcfa = dto.montantOverride ?? gym.prixMensualite;

        const [yr, mo] = dto.moisCouvert.split('-').map(Number);
        const dateDebut = new Date(yr, mo - 1, 1);
        const dateExpiration = new Date(yr, mo, 0, 23, 59, 59, 999); // dernier jour du mois

        await this.prisma.subscription.create({
          data: {
            memberId: member.id,
            formule,
            dateDebut,
            dateExpiration,
            statut: SubscriptionStatus.ACTIF,
          },
        });

        extraData = { moisCouvert: dto.moisCouvert };

        this.notifications.createAndPush(
          gymId,
          'Paiement enregistré',
          `${member.prenom} ${member.nom} — ${montantFcfa.toLocaleString('fr-FR')} FCFA (${formule} ${dto.moisCouvert})`,
          NotifType.PAIEMENT,
        ).catch(() => {});

        if (member.telephone) {
          this.scheduler.sendPaymentConfirmation(
            member.telephone, member.prenom, member.nom, montantFcfa, `${formule} ${dto.moisCouvert}`, dateExpiration,
          ).catch(() => {});
        }
        break;
      }

      // ── Séance unique ───────────────────────────────────────────────────────
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
