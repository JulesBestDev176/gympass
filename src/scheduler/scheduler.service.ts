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

  // ── Rappel J-1 : chaque jour à 9h00 ──────────────────────────────────────────
  @Cron('0 9 * * *', { timeZone: 'Africa/Dakar' })
  async sendExpirationReminderJ1() {
    this.logger.log('Cron J-1 : vérification abonnements expirant demain...');

    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const subs = await this.prisma.subscription.findMany({
      where: {
        dateExpiration: { gte: tomorrowStart, lte: tomorrowEnd },
        statut: { in: [SubscriptionStatus.ACTIF, SubscriptionStatus.EXPIRE_DEMAIN] },
        formule: { not: 'Séance' },
      },
      include: { member: true },
    });

    this.logger.log(`${subs.length} abonnement(s) expirent demain.`);

    for (const sub of subs) {
      const m = sub.member;
      if (!m.telephone || !m.carteActive) continue;

      const message =
        `Bonjour *${m.prenom} ${m.nom}* 👋\n\n` +
        `Votre abonnement *GymPass* expire *demain*.\n\n` +
        `Pour continuer à profiter de la salle, pensez à renouveler dès aujourd'hui.\n\n` +
        `_GymPass SN_`;

      await this.whatsapp.sendMessage(m.telephone, message);

      // Notification in-app
      await this.notifications.createAndPush(
        m.gymId,
        'Rappel expiration J-1',
        `${m.prenom} ${m.nom} — abonnement expire demain`,
        NotifType.EXPIRE_DEMAIN,
      ).catch(() => {});
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
