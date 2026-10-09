import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(gymId: string, memberId?: string, date?: string) {
    const where: any = { member: { gymId } };
    if (memberId) where.memberId = memberId;
    if (date) {
      const d = new Date(date);
      where.createdAt = {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lt:  new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      };
    }
    return this.prisma.entry.findMany({
      where,
      include: {
        member: { select: { id: true, nom: true, prenom: true, numeroCarte: true } },
        user:   { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async countToday(gymId: string) {
    const now = new Date();
    return this.prisma.entry.count({
      where: {
        member: { gymId },
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });
  }
}
