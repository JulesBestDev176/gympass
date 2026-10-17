import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { billingState } from './access-policy';

@Injectable()
export class BillingAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(gymId: string, now = new Date()): Promise<void> {
    let state: ReturnType<typeof billingState>;
    try {
      const account = await this.prisma.gymBillingAccount.findUnique({ where: { gymId } });
      if (!account || !account.enabled) return;
      const settings = await this.prisma.platformBillingSettings.findUnique({ where: { id: 'global' } });
      state = billingState(account, settings?.graceDays ?? 7, now);
    } catch {
      throw new ServiceUnavailableException('Vérification de l’abonnement de la salle indisponible.');
    }
    if (state.status === 'BLOCKED') throw new HttpException({
      statusCode: 402, code: 'GYM_SUBSCRIPTION_EXPIRED',
      message: 'L’abonnement de cette salle est expiré et le délai de grâce est dépassé. Contactez l’administration GymPass pour le renouveler.',
      paidUntil: state.paidUntil, graceEndsAt: state.graceEndsAt,
    }, 402);
  }
}
