import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappDelivery, WhatsappService } from '../whatsapp/whatsapp.service';
import { UploadService } from '../upload/upload.service';
import { PaymentReceiptData, receiptData } from './payment-receipt.data';
import { renderPaymentReceipt } from './payment-receipt.pdf';

const retryable = ['failed', 'unconfigured', 'disconnected', 'invalid_phone'];
type Actor = { gymId: string; id: string; role: string };

@Injectable()
export class PaymentReceiptService {
  private processing = false;
  constructor(private readonly prisma: PrismaService, private readonly whatsapp: WhatsappService,
    private readonly upload: UploadService) {}

  private async payment(id: string, actor?: Actor) {
    const where: any = { id };
    if (actor) {
      if (!actor.gymId || !['ADMIN', 'GERANT'].includes(actor.role)) throw new NotFoundException('Reçu introuvable.');
      where.gymId = actor.gymId;
      if (actor.role === 'GERANT') {
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
        const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
        where.userId = actor.id; where.createdAt = { gte: start, lt: end };
      }
    }
    const row = await this.prisma.payment.findFirst({ where,
      include: { member: true, gym: true, user: { select: { prenom: true, nom: true } } } });
    if (!row) throw new NotFoundException('Reçu introuvable.');
    return row;
  }

  private data(row: any): PaymentReceiptData {
    const data = row.receiptData || receiptData(row, row.gym, row.member, `${row.user.prenom} ${row.user.nom}`);
    return { ...data, branding: data.branding ?? { logoUrl: row.gym.logoUrl || null, brandColor: row.gym.brandColor || null } };
  }

  private result(row: any) {
    const status = row.receiptWhatsappStatus || 'not_sent';
    return { status, retryable: status === 'not_sent' || retryable.includes(status),
      messageId: row.receiptWhatsappMessageId || undefined, receipt: this.data(row),
      recipient: row.member.telephone || '', sentTo: row.receiptWhatsappRecipient || null };
  }

  async status(actor: Actor, id: string) {
    let row = await this.payment(id, actor);
    const cutoff = new Date(Date.now() - 5 * 60000);
    if (row.receiptWhatsappStatus === 'pending' && row.receiptWhatsappAttemptedAt && row.receiptWhatsappAttemptedAt < cutoff) {
      await this.prisma.payment.updateMany({ where: { id, receiptWhatsappStatus: 'pending', receiptWhatsappAttemptedAt: { lt: cutoff } },
        data: { receiptWhatsappStatus: 'unconfirmed' } });
      row = await this.payment(id, actor);
    }
    return this.result(row);
  }

  async pdf(actor: Actor, id: string) {
    const row = await this.payment(id, actor);
    const data = this.data(row);
    return { data, bytes: await this.render(row.gymId, data) };
  }

  private async render(gymId: string, data: PaymentReceiptData) {
    const [photo, logo] = await Promise.all([
      this.upload.readReceiptPhoto(data.member.photoUrl),
      this.upload.readGymLogo(gymId, data.branding?.logoUrl),
    ]);
    return renderPaymentReceipt(data, photo, logo);
  }

  async send(actor: Actor, id: string, resendOf?: string) {
    const row = await this.payment(id, actor);
    if (row.receiptWhatsappStatus === 'accepted' && resendOf !== row.receiptWhatsappMessageId) {
      throw new ConflictException('Actualisez le statut du reçu avant de le renvoyer.');
    }
    return this.deliver(id, row, resendOf);
  }

  // Called only after the payment transaction commits; the durable queue survives app restarts.
  async deliver(id: string, initial?: any, resendOf?: string) {
    const row = initial || await this.payment(id);
    const manual = !!initial;
    if (!manual && row.receiptWhatsappStatus !== 'queued') return this.result(row);
    const resend = !!resendOf && row.receiptWhatsappStatus === 'accepted' && row.receiptWhatsappMessageId === resendOf;
    if (row.receiptWhatsappStatus && !['queued', ...retryable].includes(row.receiptWhatsappStatus) && !resend) return this.result(row);
    const data = this.data(row);
    const recipient = row.member.telephone || '';
    const attemptedAt = new Date();
    const claim = await this.prisma.payment.updateMany({ where: { id, gymId: row.gymId, OR: [
      { receiptWhatsappStatus: 'queued' },
      ...(manual ? [{ receiptWhatsappStatus: null }, { receiptWhatsappStatus: { in: retryable } }] : []),
      ...(resend ? [{ receiptWhatsappStatus: 'accepted', receiptWhatsappMessageId: resendOf }] : []),
    ] }, data: { receiptData: data as any, receiptWhatsappStatus: 'pending', receiptWhatsappAttemptedAt: attemptedAt, receiptWhatsappMessageId: null, receiptWhatsappRecipient: recipient } });
    if (claim.count !== 1) return this.result(await this.payment(id));
    let delivery: WhatsappDelivery;
    let pdf: Buffer;
    try {
      pdf = await this.render(row.gymId, data);
    } catch { delivery = { status: 'failed' }; }
    if (pdf) try {
      delivery = await this.whatsapp.sendReceipt(recipient, pdf,
        `Bonjour ${data.member.name}, voici votre reçu de ${data.amount.toLocaleString('fr-FR')} FCFA auprès de ${data.gymName}. Référence : ${data.number}. Merci de votre confiance.`,
        `recu-${data.number}.pdf`);
    } catch { delivery = { status: 'unconfirmed' }; }
    await this.prisma.payment.updateMany({ where: { id, receiptWhatsappStatus: 'pending', receiptWhatsappAttemptedAt: attemptedAt },
      data: { receiptWhatsappStatus: delivery.status, receiptWhatsappMessageId: delivery.messageId || null } });
    return this.result({ ...row, receiptData: data, receiptWhatsappStatus: delivery.status, receiptWhatsappMessageId: delivery.messageId, receiptWhatsappRecipient: recipient });
  }

  @Interval(15000)
  async processQueued() {
    if (this.processing) return;
    this.processing = true;
    try {
      const rows = await this.prisma.payment.findMany({ where: { receiptWhatsappStatus: 'queued' }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 5 });
      for (const row of rows) { try { await this.deliver(row.id); } catch { /* Queue remains durable; no duplicate network retry. */ } }
    } catch { /* The next queue tick can recover from a database outage. */ }
    finally { this.processing = false; }
  }
}
