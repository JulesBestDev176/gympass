import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      // Resolve the columns even for empty tables; no business data is read.
      await this.prisma.$queryRaw`SELECT p."requestId", p."receiptData", p."receiptWhatsappStatus", b."soldAt", v."disposableKey", v."mode", s."requestId"
        FROM payments p, bracelets b, bracelet_ventes v, bracelet_sales s WHERE false`;
      return { status: 'ok', database: 'ready', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible ou migrations manquantes.');
    }
  }
}
