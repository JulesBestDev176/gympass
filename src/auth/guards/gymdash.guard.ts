import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { timingSafeEqual } from 'crypto';
import { isBillingAdministrator } from '../../platform-billing/control-access';

@Injectable()
export class GymDashGuard extends AuthGuard('jwt') {
  constructor(private readonly config: ConfigService) { super(); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers['x-gymdash-secret'];
    const expected = this.config.get<string>('GYMDASH_SECRET');
    if (!expected || typeof secret !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
      throw new UnauthorizedException('Accès GymDash refusé');
    }
    if (!await super.canActivate(context)) return false;
    if (!isBillingAdministrator(req.user, this.config.get<string>('GYMDASH_BILLING_ADMIN_EMAILS'))) throw new ForbiddenException('Accès administrateur GymDash requis');
    return true;
  }
}
