import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService, WhatsappDelivery } from '../whatsapp/whatsapp.service';

const retryableStatuses = ['failed', 'unconfigured', 'disconnected', 'invalid_phone'];
export interface CardDeliveryResult { status: string; retryable: boolean; messageId?: string; }

@Injectable()
export class MemberCardDeliveryService {
  constructor(private readonly prisma: PrismaService, private readonly whatsapp: WhatsappService) {}

  private result(status: string, messageId?: string | null): CardDeliveryResult {
    return { status, retryable: status === 'not_sent' || retryableStatuses.includes(status), ...(messageId ? { messageId } : {}) };
  }

  async status(gymId: string, id: string): Promise<CardDeliveryResult> {
    const member = await this.prisma.member.findFirst({ where: { id, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable.');
    return this.result(member.cardWhatsappStatus || 'not_sent', member.cardWhatsappMessageId);
  }

  private validate(file?: Express.Multer.File) {
    const image = file?.buffer;
    if (!image || file.mimetype !== 'image/png' || file.size > 4 * 1024 * 1024 || image.length > 4 * 1024 * 1024 || image.length < 33
      || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || image.toString('ascii', 12, 16) !== 'IHDR') throw new BadRequestException('Une carte PNG de 4 Mo maximum est requise.');
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20);
    if (!width || !height || width > 4096 || height > 4096 || width * height > 8_000_000) throw new BadRequestException('Dimensions de la carte invalides.');
    return image;
  }

  async send(gymId: string, id: string, file?: Express.Multer.File, resendOf?: string, cardNumber?: string): Promise<CardDeliveryResult> {
    const member = await this.prisma.member.findFirst({ where: { id, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable.');
    if (!member.carteActive || (cardNumber !== undefined && cardNumber !== member.numeroCarte)) {
      throw new ConflictException('La carte a changé ou a été désactivée. Actualisez la fiche.');
    }
    // A deliberate resend names the last accepted message. Replays of that same
    // request cannot reserve a second send once another attempt has replaced it.
    const resend = typeof resendOf === 'string' && resendOf.length > 0
      && member.cardWhatsappStatus === 'accepted' && member.cardWhatsappMessageId === resendOf;
    if (member.cardWhatsappStatus && !retryableStatuses.includes(member.cardWhatsappStatus) && !resend) return this.result(member.cardWhatsappStatus, member.cardWhatsappMessageId);
    const image = this.validate(file);
    const attemptedAt = new Date();
    // Persistent compare-and-set also protects against retries from another phone,
    // HTTP timeouts and concurrent requests across multiple API instances.
    const claim = await this.prisma.member.updateMany({
      where: { id, gymId, carteActive: true, numeroCarte: member.numeroCarte, OR: [
        { cardWhatsappStatus: null }, { cardWhatsappStatus: { in: retryableStatuses } },
        ...(resend ? [{ cardWhatsappStatus: 'accepted', cardWhatsappMessageId: resendOf }] : []),
      ] },
      data: { cardWhatsappStatus: 'pending', cardWhatsappAttemptedAt: attemptedAt, cardWhatsappMessageId: null },
    });
    if (claim.count !== 1) {
      const latest = await this.prisma.member.findFirst({ where: { id, gymId } });
      if (!latest || !latest.carteActive || latest.numeroCarte !== member.numeroCarte) {
        throw new ConflictException('La carte a changé ou a été désactivée. Actualisez la fiche.');
      }
      return this.result(latest?.cardWhatsappStatus || 'pending', latest?.cardWhatsappMessageId);
    }
    let delivery: WhatsappDelivery;
    try {
      delivery = await this.whatsapp.sendImage(member.telephone, image,
        `Bonjour ${member.prenom} ${member.nom}, voici votre carte GymPass (${member.numeroCarte}). Conservez-la et présentez son QR code à l’accueil de votre salle. Vous pouvez également l’imprimer au format badge.`);
    } catch { delivery = { status: 'unconfirmed' }; }
    await this.prisma.member.updateMany({ where: { id, gymId, numeroCarte: member.numeroCarte, cardWhatsappStatus: 'pending', cardWhatsappAttemptedAt: attemptedAt }, data: { cardWhatsappStatus: delivery.status, cardWhatsappMessageId: delivery.messageId || null } });
    return this.result(delivery.status, delivery.messageId);
  }
}
