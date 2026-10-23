import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancesQuery } from './finances.dto';

type Actor = { gymId: string; id: string; role: string };
type Totals = { total: bigint; amount: bigint; payments: bigint; bracelets: bigint };
type Series = { label: string; amount: bigint };

@Injectable()
export class FinancesService {
  constructor(private readonly prisma: PrismaService) {}

  private scope(user: Actor, query: FinancesQuery) {
    if (!user.gymId || !['ADMIN', 'GERANT'].includes(user.role)) throw new ForbiddenException();
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    const ownWeek = user.role === 'GERANT';
    if (ownWeek || query.period === 'week') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
      end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
    } else if (query.period === 'custom') {
      if (!query.start || !query.end) throw new BadRequestException('Choisissez les deux dates.');
      start = new Date(`${query.start}T00:00:00.000Z`);
      end = new Date(`${query.end}T00:00:00.000Z`);
      if (start.getUTCFullYear() < 2000 || end < start) throw new BadRequestException('Période invalide.');
      end.setUTCDate(end.getUTCDate() + 1);
    } else if (query.period !== 'all') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    }
    const snapshot = query.snapshot ? new Date(query.snapshot) : now;
    if (snapshot > now || snapshot.getUTCFullYear() < 2000) throw new BadRequestException('Actualisez les finances.');
    if ((ownWeek || query.period === 'week') && start && snapshot < start) {
      throw new BadRequestException('La semaine a changé. Actualisez les finances.');
    }
    return { start, end, snapshot, ownWeek };
  }

  private base(user: Actor, query: FinancesQuery) {
    const scope = this.scope(user, query);
    const search = query.search?.trim();
    const filters: Prisma.Sql[] = [Prisma.sql`"createdAt" <= ${scope.snapshot}`];
    if (scope.start) filters.push(Prisma.sql`"createdAt" >= ${scope.start}`);
    if (scope.end) filters.push(Prisma.sql`"createdAt" < ${scope.end}`);
    if (scope.ownWeek) filters.push(Prisma.sql`"userId" = ${user.id}`);
    if (query.source !== 'all') filters.push(Prisma.sql`source = ${query.source}`);
    if (query.type !== 'all') filters.push(Prisma.sql`type = ${query.type}`);
    if (query.mode !== 'all') filters.push(Prisma.sql`mode = ${query.mode}`);
    // strpos is a literal search: %, _ and quotes never become SQL patterns/code.
    if (search) filters.push(Prisma.sql`strpos(lower(concat_ws(' ', title, reference, personnel)), lower(${search})) > 0`);
    const cte = Prisma.sql`WITH receipts AS (
      SELECT 'PAYMENT'::text AS source, p.id, p."createdAt", p."montantFcfa" AS amount,
        p."userId", p.type::text AS type, p.mode::text AS mode, p.formule AS description,
        concat_ws(' ', m.prenom, m.nom) AS title, m."numeroCarte" AS reference,
        m."photoUrl", m.id AS "memberId", concat_ws(' ', u.prenom, u.nom) AS personnel
      FROM payments p JOIN members m ON m.id = p."memberId" JOIN users u ON u.id = p."userId"
      WHERE p."gymId" = ${user.gymId}
      UNION ALL
      SELECT 'BRACELET', b.id, b."createdAt", b."montantFcfa", b."userId", 'BRACELET', coalesce(b.mode::text, 'UNKNOWN'),
        'Vente de bracelet', concat('Bracelet ', br.numero), br.numero, NULL, NULL,
        concat_ws(' ', u.prenom, u.nom)
      FROM bracelet_ventes b JOIN bracelets br ON br.id = b."braceletId" JOIN users u ON u.id = b."userId"
      WHERE b."gymId" = ${user.gymId}
    ), filtered AS (SELECT * FROM receipts WHERE ${Prisma.join(filters, ' AND ')})`;
    return { ...scope, cte };
  }

  async summary(user: Actor) {
    const query = new FinancesQuery();
    const { cte, ownWeek, start, end } = this.base(user, query);
    const [row] = await this.prisma.$queryRaw<Totals[]>(Prisma.sql`${cte}
      SELECT count(*) AS total, coalesce(sum(amount),0)::bigint AS amount,
        coalesce(sum(amount) FILTER (WHERE source='PAYMENT'),0)::bigint AS payments,
        coalesce(sum(amount) FILTER (WHERE source='BRACELET'),0)::bigint AS bracelets FROM filtered`);
    return { ...this.totals(row), ownWeek, start, end };
  }

  private totals(row: Totals) {
    return { total: Number(row.total), amount: Number(row.amount), payments: Number(row.payments), bracelets: Number(row.bracelets) };
  }

  async find(user: Actor, query: FinancesQuery) {
    const { cte, ownWeek, start, end, snapshot } = this.base(user, query);
    const monthly = !start || ((end ?? snapshot).getTime() - start.getTime()) > 93 * 86400000;
    // Prisma DateTime columns store UTC timestamps without a PostgreSQL time zone.
    const bucket = monthly ? Prisma.sql`to_char("createdAt", 'YYYY-MM')` : Prisma.sql`to_char("createdAt", 'YYYY-MM-DD')`;
    const order = {
      newest: Prisma.sql`"createdAt" DESC, source ASC, id DESC`,
      oldest: Prisma.sql`"createdAt" ASC, source ASC, id ASC`,
      highest: Prisma.sql`amount DESC, "createdAt" DESC, source ASC, id DESC`,
      lowest: Prisma.sql`amount ASC, "createdAt" DESC, source ASC, id DESC`,
    }[query.sort];
    const [rows, totals, series, breakdown] = await this.prisma.$transaction([
      this.prisma.$queryRaw<any[]>(Prisma.sql`${cte} SELECT * FROM filtered ORDER BY ${order} OFFSET ${query.offset} LIMIT ${query.limit}`),
      this.prisma.$queryRaw<Totals[]>(Prisma.sql`${cte} SELECT count(*) AS total, coalesce(sum(amount),0)::bigint AS amount,
        coalesce(sum(amount) FILTER (WHERE source='PAYMENT'),0)::bigint AS payments,
        coalesce(sum(amount) FILTER (WHERE source='BRACELET'),0)::bigint AS bracelets FROM filtered`),
      this.prisma.$queryRaw<Series[]>(Prisma.sql`${cte} SELECT ${bucket} AS label, sum(amount)::bigint AS amount FROM filtered GROUP BY label ORDER BY label`),
      this.prisma.$queryRaw<Series[]>(Prisma.sql`${cte} SELECT type AS label, sum(amount)::bigint AS amount FROM filtered GROUP BY type ORDER BY amount DESC`),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const summary = this.totals(totals[0]);
    return { items: rows, summary, series: series.map(r => ({ ...r, amount: Number(r.amount) })),
      breakdown: breakdown.map(r => ({ ...r, amount: Number(r.amount) })), monthly,
      ownWeek, start, end, snapshot,
      nextOffset: query.offset + rows.length < summary.total ? query.offset + rows.length : null };
  }
}
