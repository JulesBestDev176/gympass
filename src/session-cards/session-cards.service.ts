import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionCardsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByMember(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({ where: { id: memberId, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable');
    return this.prisma.sessionCard.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({ where: { id: memberId, gymId } });
    if (!member) throw new NotFoundException('Adhérent introuvable');

    const count = await this.prisma.sessionCard.count({ where: { memberId } });
    const qrCode = `GYMPASS-CARTE-${member.numeroCarte}-${count + 1}`;

    return this.prisma.sessionCard.create({
      data: { memberId, qrCode, seancesRestantes: 0, seancesTotal: 0, active: true },
    });
  }

  async toggle(gymId: string, cardId: string) {
    const card = await this.prisma.sessionCard.findFirst({
      where: { id: cardId, member: { gymId } },
    });
    if (!card) throw new NotFoundException('Carte introuvable');
    return this.prisma.sessionCard.update({
      where: { id: cardId },
      data: { active: !card.active },
    });
  }
}
