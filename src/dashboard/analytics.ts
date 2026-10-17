import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const DAY = 86400000;
export type AnalyticsPeriod = '30d' | '90d' | '6m';
export interface AnalyticsRange {
  period: AnalyticsPeriod;
  from: Date;
  to: Date;
  granularity: 'day' | 'week' | 'month';
  label: string;
}
type Numeric = bigint | number;
export interface PaymentRow { day: string; gymId: string; mode: string; amount: Numeric; count: Numeric }
export interface DailyRow { day: string; gymId: string; count: Numeric }
export interface GymRow { id: string; name: string; status: string; members: Numeric }
export interface StatusRow { status: string; count: Numeric }
export interface AnalyticsRows {
  payments: PaymentRow[];
  members: DailyRow[];
  entries: DailyRow[];
  gyms: GymRow[];
  subscriptions: StatusRow[];
}
const MODE_LABELS = {
  ESPECES: 'Espèces', ORANGE_MONEY: 'Orange Money', WAVE: 'Wave',
  CHEQUE: 'Chèque', VIREMENT: 'Virement', AUTRE: 'Autre',
};
const STATUS_LABELS = {
  ACTIF: 'Actifs', EXPIRE_DEMAIN: 'Expiration proche', EXPIRE: 'Expirés',
  SEANCE_DISPONIBLE: 'Séance disponible', SEANCE_CONSOMMEE: 'Séance consommée',
  CARTE_DESACTIVEE: 'Carte désactivée', SANS_ABONNEMENT: 'Sans abonnement',
};

export function buildRange(period: unknown = '30d', now = new Date()): AnalyticsRange {
  if (period !== '30d' && period !== '90d' && period !== '6m') {
    throw new BadRequestException('period doit être 30d, 90d ou 6m');
  }
  const to = new Date(now.getTime());
  if (!Number.isFinite(to.getTime())) throw new BadRequestException('Date invalide');
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  if (period === '6m') {
    from.setUTCDate(1);
    from.setUTCMonth(from.getUTCMonth() - 5);
  } else {
    from.setUTCDate(from.getUTCDate() - (period === '30d' ? 29 : 89));
  }
  return { period, from, to, granularity: period === '30d' ? 'day' : period === '90d' ? 'week' : 'month',
    label: period === '6m' ? '6 derniers mois' : period === '90d' ? '90 derniers jours' : '30 derniers jours' };
}

function seriesKey(day: Date, range: AnalyticsRange): string | undefined {
  if (!Number.isFinite(day.getTime()) || day < range.from || day >= range.to) return undefined;
  if (range.granularity === 'month') return day.toISOString().slice(0, 7);
  if (range.granularity === 'week') {
    const week = Math.floor((day.getTime() - range.from.getTime()) / (7 * DAY));
    return new Date(range.from.getTime() + week * 7 * DAY).toISOString().slice(0, 10);
  }
  return day.toISOString().slice(0, 10);
}

/** Merge database aggregates only, never individual member/payment/entry records. */
export function assembleAnalytics(range: AnalyticsRange, rows: AnalyticsRows) {
  const series: { key: string; label: string; revenue: number; newMembers: number; entries: number }[] = [];
  const count = range.period === '30d' ? 30 : range.period === '90d' ? 13 : 6;
  for (let i = 0; i < count; i++) {
    const date = new Date(range.from);
    if (range.granularity === 'month') date.setUTCMonth(date.getUTCMonth() + i);
    else date.setUTCDate(date.getUTCDate() + i * (range.granularity === 'week' ? 7 : 1));
    series.push({ key: date.toISOString().slice(0, range.granularity === 'month' ? 7 : 10),
      label: date.toLocaleDateString('fr-FR', range.granularity === 'month'
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
        : { day: '2-digit', month: 'short', timeZone: 'UTC' }), revenue: 0, newMembers: 0, entries: 0 });
  }
  const byKey = new Map(series.map(point => [point.key, point]));
  const gyms = rows.gyms.map(gym => ({ id: gym.id, name: gym.name, revenue: 0, payments: 0,
    newMembers: 0, entries: 0, members: Number(gym.members) }));
  const byGym = new Map(gyms.map(gym => [gym.id, gym]));
  const paymentModes = Object.entries(MODE_LABELS).map(([mode, label]) => ({ mode, label, amount: 0, count: 0 }));
  const byMode = new Map(paymentModes.map(mode => [mode.mode, mode]));
  const subscriptions = Object.entries(STATUS_LABELS).map(([status, label]) => ({ status, label, count: 0 }));
  for (const row of rows.subscriptions) {
    const status = subscriptions.find(item => item.status === row.status);
    if (status) status.count += Number(row.count);
  }
  const totals = { revenue: 0, payments: 0, newMembers: 0, entries: 0,
    activeGyms: rows.gyms.filter(gym => gym.status === 'ACTIF').length,
    members: gyms.reduce((sum, gym) => sum + gym.members, 0) };
  for (const row of rows.payments) {
    const key = seriesKey(new Date(row.day + 'T00:00:00.000Z'), range);
    const point = byKey.get(key);
    if (!point) continue;
    const revenue = Number(row.amount);
    const payments = Number(row.count);
    point.revenue += revenue;
    totals.revenue += revenue;
    totals.payments += payments;
    const gym = byGym.get(row.gymId);
    if (gym) { gym.revenue += revenue; gym.payments += payments; }
    const mode = byMode.get(row.mode);
    if (mode) { mode.amount += revenue; mode.count += payments; }
  }
  for (const [source, field] of [[rows.members, 'newMembers'], [rows.entries, 'entries']] as const) {
    for (const row of source) {
      const point = byKey.get(seriesKey(new Date(row.day + 'T00:00:00.000Z'), range));
      if (!point) continue;
      const value = Number(row.count);
      point[field] += value;
      totals[field] += value;
      const gym = byGym.get(row.gymId);
      if (gym) gym[field] += value;
    }
  }
  gyms.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
  return { period: range.period, range: { from: range.from.toISOString(), to: range.to.toISOString(),
    granularity: range.granularity, label: range.label }, totals, series, paymentModes, subscriptions, gyms,
    generatedAt: range.to.toISOString() };
}

/** Fixed query count, parameterized dates, sargable half-open range predicates. */
export function analyticsQueries(range: AnalyticsRange) {
  const { from, to } = range;
  return {
    payments: Prisma.sql`
      SELECT TO_CHAR(p."createdAt", 'YYYY-MM-DD') AS day, p."gymId", p.mode::text AS mode,
             SUM(p."montantFcfa")::bigint AS amount, COUNT(*)::bigint AS count
      FROM payments p
      WHERE p."createdAt" >= ${from} AND p."createdAt" < ${to}
      GROUP BY 1, 2, 3`,
    members: Prisma.sql`
      SELECT TO_CHAR(m."createdAt", 'YYYY-MM-DD') AS day, m."gymId", COUNT(*)::bigint AS count
      FROM members m
      WHERE m."createdAt" >= ${from} AND m."createdAt" < ${to}
      GROUP BY 1, 2`,
    entries: Prisma.sql`
      SELECT TO_CHAR(e."createdAt", 'YYYY-MM-DD') AS day, m."gymId", COUNT(*)::bigint AS count
      FROM entries e JOIN members m ON m.id = e."memberId"
      WHERE e."createdAt" >= ${from} AND e."createdAt" < ${to}
      GROUP BY 1, 2`,
    gyms: Prisma.sql`
      SELECT g.id, g.nom AS name, g.statut::text AS status, COUNT(m.id)::bigint AS members
      FROM gyms g LEFT JOIN members m ON m."gymId" = g.id AND m."createdAt" < ${to}
      WHERE g."createdAt" < ${to}
      GROUP BY g.id, g.nom, g.statut`,
    subscriptions: Prisma.sql`
      SELECT CASE
        WHEN NOT m."carteActive" THEN 'CARTE_DESACTIVEE'
        WHEN s."dateExpiration" IS NULL THEN 'EXPIRE'
        WHEN s.formule = 'Séance' THEN s.statut::text
        WHEN s."dateExpiration" <= ${to} - INTERVAL '1 day' THEN 'EXPIRE'
        WHEN s."dateExpiration" <= ${to} + INTERVAL '1 day' THEN 'EXPIRE_DEMAIN'
        ELSE 'ACTIF'
      END AS status, COUNT(*)::bigint AS count
      FROM members m
      LEFT JOIN LATERAL (
        SELECT s.formule, s.statut, s."dateExpiration"
        FROM subscriptions s
        WHERE s."memberId" = m.id AND s."createdAt" < ${to}
        ORDER BY s."dateExpiration" DESC, s."createdAt" DESC, s.id DESC LIMIT 1
      ) s ON TRUE
      WHERE m."createdAt" < ${to}
      GROUP BY 1`,
  };
}
