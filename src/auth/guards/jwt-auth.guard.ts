import { ExecutionContext, ForbiddenException, Injectable, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { BillingAccessService } from '../../platform-billing/access.service';
import { isAccountSecurityRequest, isPlatformManagementRequest } from '../../platform-billing/control-access';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly config: ConfigService, @Optional() private readonly billing?: BillingAccessService) { super(); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;
    const request = context.switchToHttp().getRequest();
    if (!request.user?.gymId) throw new UnauthorizedException('Compte sans salle autorisée');
    const expectedGym = request.headers['x-gympass-gym-id'];
    if (expectedGym !== undefined && expectedGym !== request.user.gymId) {
      throw new ForbiddenException('La salle sélectionnée ne correspond pas à ce compte. Utilisez un compte de cette salle pour cette opération.');
    }
    const path = request.path || request.originalUrl || request.url || '';
    if (isAccountSecurityRequest(path) || isPlatformManagementRequest(request.user, request.headers, path, this.config)) return true;
    if (!this.billing) throw new ServiceUnavailableException('Vérification de l’abonnement de la salle indisponible.');
    await this.billing.assertAllowed(request.user.gymId);
    return true;
  }
}
