export interface BillingAccessAccount {
  enabled: boolean;
  activatedAt: Date;
  paidUntil: Date | null;
}
export type GymBillingStatus = 'NOT_CONFIGURED' | 'DISABLED' | 'ACTIVE' | 'GRACE' | 'BLOCKED';

export function billingState(account: BillingAccessAccount | null | undefined, graceDays: number, now = new Date()): {
  status: GymBillingStatus; paidUntil: string | null; graceEndsAt: string | null; daysRemaining: number | null;
} {
  if (!account) return { status: 'NOT_CONFIGURED', paidUntil: null, graceEndsAt: null, daysRemaining: null };
  if (!account.enabled) return { status: 'DISABLED', paidUntil: account.paidUntil?.toISOString() ?? null, graceEndsAt: null, daysRemaining: null };
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 90 || !Number.isFinite(now.getTime())) throw new Error('Invalid billing grace policy');
  const due = account.paidUntil ?? account.activatedAt;
  if (!(due instanceof Date) || !Number.isFinite(due.getTime())) throw new Error('Invalid billing account date');
  const graceEndsAt = new Date(due.getTime() + graceDays * 86_400_000);
  const active = account.paidUntil !== null && now.getTime() < due.getTime();
  const status = active ? 'ACTIVE' : now.getTime() < graceEndsAt.getTime() ? 'GRACE' : 'BLOCKED';
  const deadline = active ? due : graceEndsAt;
  return { status, paidUntil: account.paidUntil?.toISOString() ?? null, graceEndsAt: graceEndsAt.toISOString(), daysRemaining: Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000)) };
}

/** Preserve the first cycle's day through short months when appending renewals. */
export function addCalendarMonths(from: Date, months: number, anchorDay = from.getUTCDate()): Date {
  if (!Number.isFinite(from.getTime()) || !Number.isInteger(months) || months < 1 || months > 120 || !Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new Error('Invalid billing calendar period');
  const result = new Date(from);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchorDay, lastDay));
  return result;
}
