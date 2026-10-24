import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScanDto, ExceptionalEntryDto } from './dto/scan.dto';
import { SubscriptionStatus } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { BraceletsService } from '../bracelets/bracelets.service';

@Injectable()
export class ScannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly braceletsService: BraceletsService,
  ) {}

  // GymPass consultation: scanning does not record attendance or spend credits.
  async lookup(gymId: string, qrCode: string) {
    const include = {
      subscriptions: { where: { dateDebut: { lte: new Date() } }, orderBy: { dateExpiration: 'desc' as const }, take: 1 },
      sessionCards: { where: { active: true }, take: 1 },
    };
    const member = await this.prisma.member.findFirst({ where: { qrCode, gymId }, include });
    if (!member) throw new NotFoundException('Adhérent introuvable dans cette salle');
    return { ...member, statut: MembersService.computeStatus(member) };
  }

  // A POST scan consumes a session card without creating an attendance record.
  async scanMember(gymId: string, qrCode: string) {
    const include = {
      subscriptions: { where: { dateDebut: { lte: new Date() } }, orderBy: { dateExpiration: 'desc' as const }, take: 1 },
      sessionCards: { where: { active: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
    };
    const member = await this.prisma.member.findFirst({ where: { qrCode, gymId }, include });
    if (!member) throw new NotFoundException('Adhérent introuvable dans cette salle');
    const statut = MembersService.computeStatus(member);
    const card = member.sessionCards[0];
    const usesSessions = member.subscriptions[0]?.formule === 'Séance' || statut === SubscriptionStatus.EXPIRE;
    if (!usesSessions || !card) return { ...member, statut, seanceDeduite: false };
    if (!member.carteActive || !card.active) return {
      ...member, statut: SubscriptionStatus.CARTE_DESACTIVEE,
      seanceDeduite: false, scanMessage: 'Carte désactivée : aucune séance décomptée.',
      sessionCards: [card], seancesRestantes: card.seancesRestantes, formule: 'Séance',
    };
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    const now = new Date();
    const cutoff = new Date(now.getTime() - Math.max(1, gym?.antiDoubleScanSec ?? 5) * 1000);
    const result = await this.prisma.$transaction(async (tx) => {
      // The database condition also protects parallel requests and other replicas.
      const change = await tx.sessionCard.updateMany({
        where: {
          id: card.id, active: true, member: { gymId, carteActive: true },
          seancesRestantes: { gt: 0 },
          OR: [{ lastScannedAt: null }, { lastScannedAt: { lte: cutoff } }],
        },
        data: { seancesRestantes: { decrement: 1 }, lastScannedAt: now },
      });
      const updated = await tx.sessionCard.findUnique({ where: { id: card.id } });
      if (change.count === 1 && updated?.seancesRestantes === 0) {
        await tx.subscription.updateMany({
          where: { memberId: member.id, formule: 'Séance' },
          data: { statut: SubscriptionStatus.SEANCE_CONSOMMEE },
        });
      }
      return { updated: updated!, deducted: change.count === 1 };
    });
    const remaining = result.updated.seancesRestantes;
    return {
      ...member, sessionCards: [result.updated], seancesRestantes: remaining,
      formule: 'Séance',
      statut: remaining > 0 ? SubscriptionStatus.SEANCE_DISPONIBLE : SubscriptionStatus.SEANCE_CONSOMMEE,
      seanceDeduite: result.deducted,
      scanMessage: result.deducted ? '1 séance décomptée.' : remaining === 0 ? 'Aucune séance restante.' : 'Scan déjà pris en compte : aucune séance supplémentaire décomptée.',
    };
  }

  async scan(gymId: string, userId: string, dto: ScanDto) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    // Résoudre le QR : membre ou carte séances
    let member: any;

    // Bracelet séance unique (sans adhérent)
    if (dto.qrCode.startsWith('GYMPASS-BRACELET-')) {
      return this.braceletsService.scanAndRecord(gymId, userId, dto.qrCode);
    }

    if (dto.qrCode.startsWith('GYMPASS-SN-')) {
      // QR d'un membre
      member = await this.prisma.member.findFirst({
        where: { qrCode: dto.qrCode, gymId },
        include: {
          subscriptions: { where: { dateDebut: { lte: new Date() } }, orderBy: { dateExpiration: 'desc' }, take: 1 },
          sessionCards: { where: { active: true }, take: 1 },
          gym: true,
        },
      });
    }

    if (!member) throw new NotFoundException('QR code invalide ou adhérent introuvable');

    // Anti-double scan — DB-level check (works across replicas and restarts)
    const antiSec = gym?.antiDoubleScanSec ?? 5;
    const cutoff = new Date(Date.now() - antiSec * 1000);
    const recentEntry = await this.prisma.entry.findFirst({
      where: { memberId: member.id, createdAt: { gte: cutoff } },
    });
    if (recentEntry) {
      return {
        result: 'DOUBLE_SCAN',
        membre: this.formatMember(member),
        message: `Double scan détecté (délai: ${antiSec}s)`,
      };
    }

    const statut = MembersService.computeStatus(member);
    let canEnter = false;
    let result: string;

    switch (statut) {
      case SubscriptionStatus.ACTIF:
        canEnter = true;
        result = 'VALIDE';
        break;
      case SubscriptionStatus.EXPIRE_DEMAIN:
        canEnter = true;
        result = 'EXPIRE_DEMAIN';
        break;
      case SubscriptionStatus.SEANCE_DISPONIBLE:
        canEnter = true;
        result = 'SEANCE_CONSOMMEE';
        // Décrémenter la carte
        await this._consumeSeance(member);
        break;
      case SubscriptionStatus.EXPIRE:
        result = 'EXPIRE';
        canEnter = false;
        break;
      case SubscriptionStatus.SEANCE_CONSOMMEE:
        result = 'SEANCE_EPUISEE';
        canEnter = false;
        break;
      case SubscriptionStatus.CARTE_DESACTIVEE:
        result = 'DESACTIVE';
        canEnter = false;
        break;
      default:
        result = 'INCONNU';
        canEnter = false;
    }

    if (canEnter) {
      await this.prisma.entry.create({
        data: {
          memberId: member.id,
          userId,
          formule: member.subscriptions?.[0]?.formule ?? 'Inconnu',
          statut,
          exceptionnel: false,
        },
      });
    }

    return {
      result,
      canEnter,
      membre: this.formatMember(member),
      statut,
    };
  }

  async exceptionalEntry(gymId: string, userId: string, dto: ExceptionalEntryDto) {
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, gymId },
      include: { subscriptions: { take: 1, orderBy: { dateExpiration: 'desc' } } },
    });
    if (!member) throw new NotFoundException('Adhérent introuvable');

    await this.prisma.entry.create({
      data: {
        memberId: member.id,
        userId,
        formule: member.subscriptions?.[0]?.formule ?? 'Inconnu',
        statut: SubscriptionStatus.EXPIRE,
        exceptionnel: true,
        motifExceptionnel: dto.motif,
      },
    });

    return { message: 'Autorisation exceptionnelle enregistrée', memberId: member.id };
  }

  private async _consumeSeance(member: any) {
    const card = member.sessionCards?.[0];
    if (!card) return;

    const newCount = Math.max(0, card.seancesRestantes - 1);
    await this.prisma.sessionCard.update({
      where: { id: card.id },
      data: {
        seancesRestantes: newCount,
        ...(newCount === 0 ? {} : {}),
      },
    });

    if (newCount === 0) {
      await this.prisma.subscription.updateMany({
        where: { memberId: member.id, formule: 'Séance' },
        data: { statut: SubscriptionStatus.SEANCE_CONSOMMEE },
      });
    }
  }

  private formatMember(member: any) {
    return {
      id: member.id,
      nomComplet: `${member.prenom} ${member.nom}`,
      telephone: member.telephone,
      numeroCarte: member.numeroCarte,
      carteActive: member.carteActive,
      dateExpiration: member.subscriptions?.[0]?.dateExpiration,
      seancesRestantes: member.sessionCards?.[0]?.seancesRestantes,
    };
  }
}
