import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScanDto, ExceptionalEntryDto } from './dto/scan.dto';
import { SubscriptionStatus } from '@prisma/client';
import { MembersService } from '../members/members.service';

@Injectable()
export class ScannerService {
  // Anti-double-scan : memberId → dernière entrée timestamp
  private readonly lastScan = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async scan(gymId: string, userId: string, dto: ScanDto) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    // Résoudre le QR : membre ou carte séances
    let member: any;
    let isCarteSeance = false;

    if (dto.qrCode.startsWith('GYMPASS-SN-')) {
      // QR d'un membre
      member = await this.prisma.member.findUnique({
        where: { qrCode: dto.qrCode },
        include: {
          subscriptions: { orderBy: { dateExpiration: 'desc' }, take: 1 },
          sessionCards: { where: { active: true }, take: 1 },
          gym: true,
        },
      });
    } else if (dto.qrCode.startsWith('GYMPASS-CARTE-')) {
      // QR d'une carte séances
      const card = await this.prisma.sessionCard.findUnique({
        where: { qrCode: dto.qrCode },
        include: { member: { include: { subscriptions: true, sessionCards: true } } },
      });
      if (!card) throw new NotFoundException('Carte introuvable');
      member = card.member;
      isCarteSeance = true;
    }

    if (!member) throw new NotFoundException('QR code invalide ou adhérent introuvable');
    if (member.gymId !== gymId) throw new BadRequestException('QR code d\'un autre gym');

    // Anti-double scan
    const antiSec = gym?.antiDoubleScanSec ?? 5;
    const last = this.lastScan.get(member.id);
    if (last && Date.now() - last < antiSec * 1000) {
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
      this.lastScan.set(member.id, Date.now());
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
