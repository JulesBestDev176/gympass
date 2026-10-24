import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

// Keep this boundary local to shop so the isolated production release does not
// depend on unrelated changes to the global staff guard in development.
@Injectable()
export class ShopScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.user?.gymId || !request.user?.id) throw new UnauthorizedException();
    const selected = request.headers['x-gympass-gym-id'];
    if (selected !== undefined && selected !== request.user.gymId) {
      throw new ForbiddenException('La salle sélectionnée ne correspond pas à ce compte.');
    }
    return true;
  }
}
