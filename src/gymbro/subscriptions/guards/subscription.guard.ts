import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class GymbroSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié');

    const sub = await this.prisma.gymbroSubscription.findFirst({
      where: { userId, statut: 'ACTIVE', dateExpiration: { gt: new Date() } },
    });

    if (!sub) {
      throw new ForbiddenException('Abonnement requis pour accéder au programme complet');
    }

    return true;
  }
}
