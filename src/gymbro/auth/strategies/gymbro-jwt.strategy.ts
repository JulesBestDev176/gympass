import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class GymbroJwtStrategy extends PassportStrategy(Strategy, 'gymbro-jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; app: string; tokenType?: string }) {
    if (payload.tokenType === 'refresh') throw new UnauthorizedException('Token invalide');
    if (payload.app !== 'gymbro') throw new UnauthorizedException('Token non autorisé');

    const user = await this.prisma.gymbroUser.findUnique({ where: { id: payload.sub } });
    if (!user || !user.actif) throw new UnauthorizedException('Compte inactif ou introuvable');
    return user;
  }
}
