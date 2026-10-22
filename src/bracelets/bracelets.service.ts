import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BraceletEntriesQuery } from './bracelet-entries.dto';

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

  async findEntries(gymId: string, query: BraceletEntriesQuery) {
    if (query.month && query.date) throw new BadRequestException('Choisissez un jour ou un mois.');
    const now = new Date();
    const month = query.month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const start = new Date(`${query.date ?? `${month}-01`}T00:00:00.000Z`);
    if (!Number.isFinite(start.getTime()) || start.getUTCFullYear() < 2000) throw new BadRequestException('Période invalide.');
    const end = new Date(start);
    if (query.date) end.setUTCDate(end.getUTCDate() + 1);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    const where = { gymId, createdAt: { gte: start, lt: end } };
    if (query.cursor && !await this.prisma.braceletVente.findFirst({
      where: { ...where, id: query.cursor }, select: { id: true },
    })) throw new BadRequestException('Curseur invalide. Actualisez la liste.');
    const limit = query.limit ?? 20;
    const [rows, totals] = await this.prisma.$transaction([
      this.prisma.braceletVente.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true, createdAt: true, montantFcfa: true,
          bracelet: { select: { numero: true } },
          user: { select: { id: true, nom: true, prenom: true } },
        },
      }),
      this.prisma.braceletVente.aggregate({ where, _count: true, _sum: { montantFcfa: true } }),
    ]);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      items, nextCursor: hasMore ? items[items.length - 1].id : null,
      total: totals._count, montantTotal: totals._sum.montantFcfa ?? 0,
    };
  }
}
