import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { PaymentType, SubscriptionStatus, NotifType, UserRole } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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
        formule = 'Mensuel';
        montantFcfa = dto.montantOverride ?? gym.prixMensualite;

        const now = new Date();
        const dateDebut = now;
        let dateExpiration: Date;

        // Chercher le dernier abonnement mensuel (actif ou expiré)
        const dernierSub = await this.prisma.subscription.findFirst({
          where: { memberId: member.id, formule: 'Mensuel' },
          orderBy: { dateExpiration: 'desc' },
        });

        if (dernierSub && now <= new Date(dernierSub.dateExpiration)) {
          // Renouvellement dans les temps → on repart de la date d'expiration existante
          dateExpiration = new Date(dernierSub.dateExpiration);
          dateExpiration.setMonth(dateExpiration.getMonth() + 1);
        } else {
          // Première inscription ou renouvellement tardif → aujourd'hui est la référence
          dateExpiration = new Date(now);
          dateExpiration.setMonth(dateExpiration.getMonth() + 1);
        }

        await this.prisma.subscription.create({
          data: {
            memberId: member.id,
            formule,
            dateDebut,
            dateExpiration,
            statut: SubscriptionStatus.ACTIF,
          },
        });

        // Notification in-app + push broadcast
        await this.notifications.createAndPush(
          gymId,
          'Paiement enregistré',
          `${member.prenom} ${member.nom} — ${montantFcfa.toLocaleString('fr-FR')} FCFA (${formule})`,
          NotifType.PAIEMENT,
        );
        break;
      }

      // ── Séance unique ───────────────────────────────────────────────────────
      case PaymentType.SEANCE_UNIQUE: {
        formule = 'Séance unique';
        montantFcfa = gym.prixSeance;
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
        break;
      }

      // ── Frais d'inscription ─────────────────────────────────────────────────
      case PaymentType.INSCRIPTION: {
        formule = 'Inscription';
        montantFcfa = dto.montantOverride ?? gym.fraisInscription;
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
