import { ForbiddenException } from '@nestjs/common';

export function paymentVisibility(gymId: string, userId?: string, role = 'ADMIN', now = new Date()): {
  gymId: string; userId?: string; createdAt?: { gte: Date; lt: Date };
} {
  if (!gymId || !['ADMIN', 'GERANT'].includes(role)) throw new ForbiddenException();
  if (role === 'ADMIN') return { gymId };
  if (!userId) throw new ForbiddenException();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return { gymId, userId, createdAt: { gte: start, lt: end } };
}
