import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  // ── Génération numéro de carte ──────────────────────────────────────────────
  private async generateNumeroCarte(tx: any, gymId: string): Promise<string> {
    // Row-level atomic increment: concurrent requests and deletions cannot reuse a number.
    const gym = await tx.gym.update({ where: { id: gymId }, data: { memberCounter: { increment: 1 } } });
    const words = gym.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[A-Za-z0-9]+/g) || ['GYM'];
    const prefix = words.map((word: string) => word[0]).join('').toUpperCase();
    return `${prefix}-${String(gym.memberCounter).padStart(3, '0')}`;
  }

  // ── Statut courant d'un member (basé sur sa subscription active) ─────────────
  static computeStatus(member: any): SubscriptionStatus {
    if (!member.carteActive) return SubscriptionStatus.CARTE_DESACTIVEE;

    // Trouver la subscription active la plus récente
    const subscriptions: any[] = (member.subscriptions ?? []).filter((sub: any) => !sub.dateDebut || new Date(sub.dateDebut) <= new Date());
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
        subscriptions: { where: { dateDebut: { lte: new Date() } }, orderBy: { dateExpiration: 'desc' }, take: 1 },
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
        subscriptions: { where: { dateDebut: { lte: new Date() } }, orderBy: { dateExpiration: 'desc' } },
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
        subscriptions: { where: { dateDebut: { lte: new Date() } }, orderBy: { dateExpiration: 'desc' }, take: 1 },
        sessionCards: { where: { active: true }, take: 1 },
        gym: true,
      },
    });
    if (!member) throw new NotFoundException('QR code invalide');
    return { ...member, statut: MembersService.computeStatus(member) };
  }

  async create(gymId: string, userId: string, dto: CreateMemberDto) {
    const sessionOnly = dto.formule?.type === 'SEANCES';
    const sessions = sessionOnly ? dto.formule?.nbSeances ?? 0 : 0;
    if (sessionOnly && sessions < 1) throw new BadRequestException('Choisissez au moins une séance.');
    if (!sessionOnly && dto.formule?.nbSeances !== undefined)
      throw new BadRequestException('Choisissez le mensuel ou les séances à l’inscription.');
    const now = new Date();
    const dateExpiration = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return this.prisma.$transaction(async (tx) => {
      // Serialize allocation and idempotent retries for this gym.
      await tx.$queryRawUnsafe('SELECT id FROM gyms WHERE id=$1 FOR UPDATE', gymId);
      const gym = await tx.gym.findUnique({ where: { id: gymId } });
      if (!gym) throw new NotFoundException('Gym introuvable');
      const include = { payments: { orderBy: { createdAt: 'asc' as const } }, sessionCards: true, subscriptions: { orderBy: { dateExpiration: 'desc' as const } } };
      const result = (member: any) => ({ ...member,
        montantEncaisse: member.payments[0]?.montantFcfa ?? 0,
        statut: MembersService.computeStatus(member),
        formule: member.subscriptions[0]?.formule ?? 'Séance',
        seancesRestantes: member.sessionCards[0]?.seancesRestantes,
        dateExpiration: sessionOnly ? null : member.subscriptions[0]?.dateExpiration,
      });
      if (dto.registrationRequestId) {
        const previous = await tx.member.findFirst({ where: { gymId, registrationRequestId: dto.registrationRequestId }, include });
        if (previous) {
          const initialPayment = previous.payments[0];
          const wasSessions = initialPayment?.type === 'RECHARGE_CARTE';
          if (previous.nom !== dto.nom || previous.prenom !== dto.prenom || previous.telephone !== dto.telephone || initialPayment?.mode !== dto.paiement.mode || wasSessions !== sessionOnly || (sessionOnly && initialPayment?.formule !== `Carte de ${sessions} s\u00e9ances`))
            throw new ConflictException('Cette inscription a déjà été enregistrée avec des informations différentes.');
          return result(previous);
        }
      }
      const expected = sessionOnly ? sessions * gym.prixSeance : gym.fraisInscription;
      if (dto.montantAttendu !== undefined && dto.montantAttendu !== expected)
        throw new ConflictException('Les tarifs ont changé. Actualisez les tarifs avant de valider.');
      const numeroCarte = await this.generateNumeroCarte(tx, gymId);
      const member = await tx.member.create({ data: {
        gymId, numeroCarte, registrationRequestId: dto.registrationRequestId, qrCode: `GYMPASS-SN-${gymId}-${numeroCarte}`,
        nom: dto.nom, prenom: dto.prenom, telephone: dto.telephone, photoUrl: dto.photoUrl,
      } });
      if (sessionOnly) {
        const card = await tx.sessionCard.create({ data: { memberId: member.id, qrCode: `GYMPASS-CARTE-${member.id}`, seancesRestantes: sessions, seancesTotal: sessions, active: true } });
        await tx.payment.create({ data: { gymId, memberId: member.id, userId,
          sessionCardId: card.id, type: 'RECHARGE_CARTE', formule: `Carte de ${sessions} s\u00e9ances`,
          montantFcfa: sessions * gym.prixSeance, mode: dto.paiement.mode,
          reference: dto.paiement.reference, note: dto.paiement.note,
        } });
        await tx.subscription.create({ data: { memberId: member.id, formule: 'Séance', dateDebut: now, dateExpiration, statut: 'SEANCE_DISPONIBLE' } });
      } else {
        await tx.payment.create({ data: { gymId, memberId: member.id, userId, type: 'INSCRIPTION', formule: 'Inscription',
          montantFcfa: gym.fraisInscription, mode: dto.paiement.mode, reference: dto.paiement.reference, note: dto.paiement.note,
        } });
        // The initial fee grants access until month-end; monthly renewal is paid later.
        await tx.subscription.create({ data: { memberId: member.id, formule: 'Mensuel', dateDebut: now, dateExpiration, statut: 'ACTIF' } });
      }
      return result(await tx.member.findUniqueOrThrow({ where: { id: member.id }, include }));
    });
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

    return this.prisma.$transaction(async (tx) => {
      const newNumeroCarte = await this.generateNumeroCarte(tx, gymId);
      return tx.member.update({ where: { id }, data: {
        numeroCarte: newNumeroCarte, qrCode: `GYMPASS-SN-${gymId}-${newNumeroCarte}`, carteActive: true,
        cardWhatsappStatus: null, cardWhatsappAttemptedAt: null, cardWhatsappMessageId: null,
      } });
    });
  }

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
