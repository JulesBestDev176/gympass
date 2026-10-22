import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionStatus, NotifType } from '@prisma/client';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Rappels J-5 à J-1 : chaque jour à 9h00 ──────────────────────────────────
  // Envoie un rappel WhatsApp chaque jour durant les 5 derniers jours
  // d'abonnement, jusqu'à ce que le mois suivant soit payé.
  @Cron('0 9 * * *', { timeZone: 'Africa/Dakar' })
  async sendExpirationReminders() {
    this.logger.log('Cron J-5→J-1 : vérification abonnements expirant dans 1 à 5 jours...');

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fenêtre : expiration entre demain (J+1) et J+5 inclus
    const windowStart = new Date(todayStart);
    windowStart.setDate(windowStart.getDate() + 1);

    const windowEnd = new Date(todayStart);
    windowEnd.setDate(windowEnd.getDate() + 5);
    windowEnd.setHours(23, 59, 59, 999);

    const subs = await this.prisma.subscription.findMany({
      where: {
        dateExpiration: { gte: windowStart, lte: windowEnd },
        statut: { in: [SubscriptionStatus.ACTIF, SubscriptionStatus.EXPIRE_DEMAIN] },
        formule: { not: 'Séance' },
        member: { carteActive: true },
      },
      include: { member: true },
    });

    this.logger.log(`${subs.length} abonnement(s) dans la fenêtre J-5→J-1.`);

    for (const sub of subs) {
      // A paid, contiguous renewal supersedes this expiration (including the registration grant).
      const renewed = await this.prisma.subscription.findFirst({ where: {
        memberId: sub.member.id, formule: { not: 'Séance' },
        dateDebut: { lte: new Date(new Date(sub.dateExpiration).getTime() + 1) },
        dateExpiration: { gt: sub.dateExpiration },
      } });
      if (renewed) continue;
      const m = sub.member;
      if (!m.telephone) continue;

      // Vérifier si le mois suivant la date d'expiration est déjà payé
      const expDate = new Date(sub.dateExpiration);
      const nextMonthDate = new Date(expDate.getFullYear(), expDate.getMonth() + 1, 1);
      const nextMoisCouvert =
        `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

      const alreadyPaid = await this.prisma.payment.findFirst({
        where: { memberId: m.id, type: 'ABONNEMENT', moisCouvert: nextMoisCouvert },
      });
      if (alreadyPaid) continue; // Déjà payé → pas de rappel

      // Nombre de jours restants (arrondi au supérieur)
      const daysLeft = Math.ceil(
        (expDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
      );

      const expirationStr = daysLeft === 1
        ? '*demain* 🔴'
        : `dans *${daysLeft} jours* 🟡`;

      const message =
        `Bonjour *${m.prenom} ${m.nom}* 👋\n\n` +
        `Votre abonnement *GymPass* expire ${expirationStr}.\n\n` +
        `Pour continuer à accéder à la salle, pensez à renouveler avant la date d'expiration.\n\n` +
        `Contactez la réception pour régler votre mensualité.\n\n` +
        `_GymPass SN_`;

      await this.whatsapp.sendMessage(m.telephone, message).catch(() => {});

      // Notification in-app uniquement à J-1 pour éviter le spam
      if (daysLeft === 1) {
        await this.notifications.createAndPush(
          m.gymId,
          'Rappel expiration J-1',
          `${m.prenom} ${m.nom} — abonnement expire demain`,
          NotifType.EXPIRE_DEMAIN,
        ).catch(() => {});
      }

      this.logger.log(`Rappel J-${daysLeft} envoyé à ${m.prenom} ${m.nom} (${m.telephone})`);
    }
  }

  // ── Abonnements expirés : chaque jour à 10h00 ─────────────────────────────────
  @Cron('0 10 * * *', { timeZone: 'Africa/Dakar' })
  async sendExpiredNotification() {
    this.logger.log('Cron expirés : vérification abonnements expirés ce jour...');

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Abonnements expirés depuis hier (date hier)
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const subs = await this.prisma.subscription.findMany({
      where: {
        dateExpiration: { gte: yesterdayStart, lte: yesterdayEnd },
        formule: { not: 'Séance' },
      },
      include: { member: true },
    });

    this.logger.log(`${subs.length} abonnement(s) expiré(s) hier.`);

    for (const sub of subs) {
      // A paid, contiguous renewal supersedes this expiration (including the registration grant).
      const renewed = await this.prisma.subscription.findFirst({ where: {
        memberId: sub.member.id, formule: { not: 'Séance' },
        dateDebut: { lte: new Date(new Date(sub.dateExpiration).getTime() + 1) },
        dateExpiration: { gt: sub.dateExpiration },
      } });
      if (renewed) continue;
      const m = sub.member;
      if (!m.telephone || !m.carteActive) continue;

      const message =
        `Bonjour *${m.prenom} ${m.nom}*,\n\n` +
        `Votre abonnement *GymPass* a expiré hier.\n\n` +
        `🔴 Votre accès à la salle est suspendu jusqu'au renouvellement.\n\n` +
        `Contactez la réception pour renouveler votre abonnement.\n\n` +
        `_GymPass SN_`;

      await this.whatsapp.sendMessage(m.telephone, message);

      await this.notifications.createAndPush(
        m.gymId,
        'Abonnement expiré',
        `${m.prenom} ${m.nom} — abonnement expiré`,
        NotifType.EXPIRATION,
      ).catch(() => {});
    }
  }

  // ── Méthodes déclenchées à la demande (pas des crons) ─────────────────────────

  // Appelé après inscription d'un nouvel adhérent
  async sendWelcome(telephone: string, prenom: string, nom: string, numeroCarte: string) {
    const message =
      `Bienvenue *${prenom} ${nom}* ! 🎉\n\n` +
      `Votre inscription à *GymPass SN* est confirmée.\n\n` +
      `🪪 N° carte : *${numeroCarte}*\n\n` +
      `Présentez votre QR code à chaque entrée en salle.\n\n` +
      `_GymPass SN_`;
    await this.whatsapp.sendMessage(telephone, message);
  }

  // Appelé après enregistrement d'un paiement
  async sendPaymentConfirmation(
    telephone: string,
    prenom: string,
    nom: string,
    montant: number,
    formule: string,
    dateExpiration?: Date,
  ) {
    const expStr = dateExpiration
      ? `\n📅 Valable jusqu'au : *${dateExpiration.toLocaleDateString('fr-FR')}*`
      : '';

    const message =
      `Bonjour *${prenom} ${nom}*,\n\n` +
      `✅ Paiement enregistré : *${montant.toLocaleString('fr-FR')} FCFA* — ${formule}${expStr}\n\n` +
      `Merci de votre confiance !\n\n` +
      `_GymPass SN_`;
    await this.whatsapp.sendMessage(telephone, message);
  }
}
