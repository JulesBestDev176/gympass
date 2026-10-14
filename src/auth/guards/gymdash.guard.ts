import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GymDashGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = req.headers['x-gymdash-secret'];
    const expected = this.config.get<string>('GYMDASH_SECRET');
    if (!expected || secret !== expected) {
      throw new UnauthorizedException('Accès GymDash refusé');
    }
    return true;
  }
}
