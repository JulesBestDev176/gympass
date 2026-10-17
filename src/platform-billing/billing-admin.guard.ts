import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { isBillingAdministrator } from './control-access';
@Injectable()
export class BillingAdminGuard implements CanActivate {
    constructor(private readonly config: ConfigService) { }
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        const expected = this.config.get<string>('GYMDASH_SECRET');
        const secret = req.headers['x-gymdash-secret'];
        if (!expected || typeof secret !== 'string' || Buffer.byteLength(secret) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(secret), Buffer.from(expected)) || !isBillingAdministrator(req.user, this.config.get<string>('GYMDASH_BILLING_ADMIN_EMAILS')))
            throw new ForbiddenException('Accès facturation refusé');
        return true;
    }
}
