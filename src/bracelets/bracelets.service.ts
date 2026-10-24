import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BraceletEntriesQuery } from './bracelet-entries.dto';
import { CreateBraceletSaleDto } from './bracelet-sale.dto';
import { Prisma } from '@prisma/client';

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
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new BadRequestException('Entre 1 et 100 bracelets');
    }
    return this.prisma.$transaction(async tx => {
      // Shared across all app instances; count-based allocation races and can
      // reuse an existing number when earlier bracelets have been removed.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`bracelet-generation:${gymId}`}))::text`);
      const gym = await tx.gym.findUnique({ where: { id: gymId }, select: { id: true } });
      if (!gym) throw new NotFoundException('Gym introuvable');
      const [row] = await tx.$queryRaw<{ maximum: string }[]>(Prisma.sql`
        SELECT coalesce(max(substring(numero from 3)::numeric), 0)::text AS maximum
        FROM bracelets WHERE "gymId" = ${gymId} AND numero ~ '^B-[0-9]+$'
      `);
      const highest = Number(row.maximum);
      if (!Number.isSafeInteger(highest + count)) {
        throw new BadRequestException('Numérotation des bracelets à vérifier.');
      }
      const data = Array.from({ length: count }, (_, index) => {
        const numero = `B-${String(highest + index + 1).padStart(3, '0')}`;
        return { id: randomUUID(), gymId, numero, qrCode: `GYMPASS-BRACELET-${gymId}-${numero}` };
      });
      await tx.bracelet.createMany({ data });
      const rows = await tx.bracelet.findMany({ where: { gymId, id: { in: data.map(row => row.id) } } });
      const byId = new Map(rows.map(row => [row.id, row]));
      return data.map(row => byId.get(row.id)!);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15000, timeout: 30000 });
  }

  async toggle(gymId: string, id: string) {
    const b = await this.prisma.bracelet.findFirst({ where: { id, gymId } });
    if (!b) throw new NotFoundException('Bracelet introuvable');
    return this.prisma.bracelet.update({ where: { id }, data: { actif: !b.actif } });
  }

  async lookup(gymId: string, qrCode: string) {
    const bracelet = await this.prisma.bracelet.findFirst({ where: { gymId, qrCode } });
    if (!bracelet) throw new NotFoundException('Bracelet introuvable.');
    if (bracelet.soldAt) throw new ConflictException(`Le bracelet ${bracelet.numero} est déjà vendu.`);
    if (!bracelet.actif) throw new BadRequestException('Bracelet désactivé.');
    const gym = await this.prisma.gym.findUniqueOrThrow({ where: { id: gymId }, select: { prixSeance: true } });
    return { ...bracelet, prixSeance: gym.prixSeance };
  }

  async scanAndRecord(gymId: string, userId: string, qrCode: string) {
    await this.lookup(gymId, qrCode);
    throw new BadRequestException('Confirmez la vente du bracelet depuis l’écran de vente.');
  }

  private replaySale(row: any, userId: string, dto: CreateBraceletSaleDto) {
    const codes = row.items.map((item: any) => item.bracelet.qrCode).sort();
    if (row.userId !== userId || (row.mode ?? null) !== (dto.mode ?? null) || row.unitPrice !== dto.expectedUnitPrice
      || JSON.stringify(codes) !== JSON.stringify([...dto.qrCodes].sort())) {
      throw new ConflictException('Cette demande correspond déjà à une autre vente.');
    }
    return row;
  }

  async sell(gymId: string, userId: string, dto: CreateBraceletSaleDto) {
    const include = { items: { include: { bracelet: { select: { id: true, numero: true, qrCode: true } } } } };
    const existing = await this.prisma.braceletSale.findUnique({ where: { gymId_requestId: { gymId, requestId: dto.requestId } }, include });
    if (existing) return this.replaySale(existing, userId, dto);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM bracelets WHERE "gymId"=${gymId} AND "qrCode" IN (${Prisma.join(dto.qrCodes)}) ORDER BY id FOR UPDATE`);
        const replay = await tx.braceletSale.findUnique({ where: { gymId_requestId: { gymId, requestId: dto.requestId } }, include });
        if (replay) return this.replaySale(replay, userId, dto);
        const bracelets = await tx.bracelet.findMany({ where: { gymId, qrCode: { in: dto.qrCodes } } });
        if (bracelets.length !== dto.qrCodes.length) throw new NotFoundException('Un bracelet ne fait pas partie de cette salle.');
        const sold = bracelets.find(b => b.soldAt);
        if (sold) throw new ConflictException(`Le bracelet ${sold.numero} est déjà vendu. Aucune vente de ce lot n'a été enregistrée.`);
        if (bracelets.some(b => !b.actif)) throw new BadRequestException('Un bracelet du lot est désactivé.');
        const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId } });
        if (gym.prixSeance !== dto.expectedUnitPrice) throw new ConflictException('Le tarif de la séance a changé. Actualisez le tarif avant de confirmer la vente.');
        const now = new Date();
        const sale = await tx.braceletSale.create({ data: { gymId, userId, requestId: dto.requestId, mode: dto.mode ?? null,
          unitPrice: gym.prixSeance, quantity: bracelets.length, totalFcfa: gym.prixSeance * bracelets.length, createdAt: now } });
        const reserved = await tx.bracelet.updateMany({ where: { id: { in: bracelets.map(b => b.id) }, gymId, actif: true, soldAt: null }, data: { soldAt: now } });
        if (reserved.count !== bracelets.length) throw new ConflictException('Un bracelet de ce lot est déjà vendu.');
        await tx.braceletVente.createMany({ data: bracelets.map(b => ({ gymId, userId, braceletId: b.id,
          disposableKey: b.id, saleId: sale.id, mode: dto.mode ?? null, montantFcfa: gym.prixSeance, createdAt: now })) });
        return tx.braceletSale.findUniqueOrThrow({ where: { id: sale.id }, include });
      });
    } catch (error) {
      const replay = await this.prisma.braceletSale.findUnique({ where: { gymId_requestId: { gymId, requestId: dto.requestId } }, include });
      if (replay) return this.replaySale(replay, userId, dto);
      if ((error as any)?.code === 'P2002') throw new ConflictException('Un bracelet de ce lot est déjà vendu.');
      throw error;
    }
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
    const now = new Date();
    const snapshot = query.snapshot ? new Date(query.snapshot) : now;
    if (!Number.isFinite(snapshot.getTime()) || snapshot > now || snapshot.getUTCFullYear() < 2000) throw new BadRequestException('Actualisez la liste.');
    const period = query.period || (query.date ? 'today' : 'month');
    let start: Date | undefined, end: Date | undefined;
    if (period === 'custom') {
      if (!query.start || !query.end) throw new BadRequestException('Choisissez les dates de début et de fin.');
      start = new Date(`${query.start}T00:00:00Z`); end = new Date(`${query.end}T00:00:00Z`);
      if (end < start) throw new BadRequestException('Période invalide.');
      end.setUTCDate(end.getUTCDate() + 1);
    } else if (period === 'today' || period === 'week') {
      start = query.date ? new Date(`${query.date}T00:00:00Z`) : new Date(Date.UTC(snapshot.getUTCFullYear(), snapshot.getUTCMonth(), snapshot.getUTCDate()));
      if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
      end = new Date(start); end.setUTCDate(end.getUTCDate() + (period === 'week' ? 7 : 1));
    } else if (period === 'month') {
      const month = query.month || `${snapshot.getUTCFullYear()}-${String(snapshot.getUTCMonth() + 1).padStart(2, '0')}`;
      start = new Date(`${month}-01T00:00:00Z`); end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
    }
    if (start && (!Number.isFinite(start.getTime()) || start.getUTCFullYear() < 2000)) throw new BadRequestException('Période invalide.');
    const where = { gymId, createdAt: { lte: snapshot, ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } };
    if (query.cursor && !await this.prisma.braceletVente.findFirst({
      where: { ...where, id: query.cursor }, select: { id: true },
    })) throw new BadRequestException('Curseur invalide. Actualisez la liste.');
    const limit = query.limit ?? 20;
    const [rows, totals] = await this.prisma.$transaction([
      this.prisma.braceletVente.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true, createdAt: true, montantFcfa: true, mode: true, saleId: true,
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
      total: totals._count, montantTotal: totals._sum.montantFcfa ?? 0, snapshot, start, end,
    };
  }
}
