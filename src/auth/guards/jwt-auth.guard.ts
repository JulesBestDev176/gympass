import { ExecutionContext, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
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
    const path = request.path || request.originalUrl || request.url || '';
    if (!request.user?.gymId || isAccountSecurityRequest(path) || isPlatformManagementRequest(request.user, request.headers, path, this.config)) return true;
    if (!this.billing) throw new ServiceUnavailableException('Vérification de l’abonnement de la salle indisponible.');
    await this.billing.assertAllowed(request.user.gymId);
    return true;
  }
}
