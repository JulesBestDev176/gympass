import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BraceletsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(gymId: string) {
    return this.prisma.bracelet.findMany({
      where: { gymId },
      include: { _count: { select: { ventes: true } } },
      orderBy: { numero: 'asc' },
    });
  }

  async generate(gymId: string, count: number) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) throw new NotFoundException('Gym introuvable');
    if (count < 1 || count > 100) throw new BadRequestException('Entre 1 et 100 bracelets');

    const existing = await this.prisma.bracelet.count({ where: { gymId } });
    const bracelets = [];
    for (let i = 1; i <= count; i++) {
      const n = existing + i;
      const numero = `B-${String(n).padStart(3, '0')}`;
      const qrCode = `GYMPASS-BRACELET-${gymId}-${numero}`;
      bracelets.push({ gymId, numero, qrCode });
    }
    return this.prisma.bracelet.createMany({ data: bracelets });
  }

  async toggle(gymId: string, id: string) {
    const b = await this.prisma.bracelet.findFirst({ where: { id, gymId } });
    if (!b) throw new NotFoundException('Bracelet introuvable');
    return this.prisma.bracelet.update({ where: { id }, data: { actif: !b.actif } });
  }

  async scanAndRecord(gymId: string, userId: string, qrCode: string) {
    const bracelet = await this.prisma.bracelet.findFirst({
      where: { qrCode, gymId, actif: true },
    });
    if (!bracelet) throw new NotFoundException('Bracelet introuvable ou désactivé');

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    const montantFcfa = gym?.prixSeance ?? 0;

    const vente = await this.prisma.braceletVente.create({
      data: { gymId, braceletId: bracelet.id, userId, montantFcfa },
    });

    return {
      result: 'BRACELET_SEANCE',
      isBracelet: true,
      braceletNumero: bracelet.numero,
      montantFcfa,
      venteId: vente.id,
    };
  }

  async getStats(gymId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [today, month] = await Promise.all([
      this.prisma.braceletVente.aggregate({
        where: { gymId, createdAt: { gte: startOfDay } },
        _sum: { montantFcfa: true },
        _count: true,
      }),
      this.prisma.braceletVente.aggregate({
        where: { gymId, createdAt: { gte: startOfMonth } },
        _sum: { montantFcfa: true },
        _count: true,
      }),
    ]);

    return {
      ventesToday: today._count,
      revenuToday: today._sum.montantFcfa ?? 0,
      ventesMois: month._count,
      revenuMois: month._sum.montantFcfa ?? 0,
    };
  }
}
