import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { analyticsQueries, assembleAnalytics, buildRange, DailyRow, GymRow, PaymentRow, StatusRow } from './analytics';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalAnalytics(period?: string, now = new Date()) {
    const range = buildRange(period, now);
    const queries = analyticsQueries(range);
    const [payments, members, entries, gyms, subscriptions] = await this.prisma.$transaction([
      this.prisma.$queryRaw<PaymentRow[]>(queries.payments),
      this.prisma.$queryRaw<DailyRow[]>(queries.members),
      this.prisma.$queryRaw<DailyRow[]>(queries.entries),
      this.prisma.$queryRaw<GymRow[]>(queries.gyms),
      this.prisma.$queryRaw<StatusRow[]>(queries.subscriptions),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return assembleAnalytics(range, { payments, members, entries, gyms, subscriptions });
  }
}
