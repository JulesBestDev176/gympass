import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; tokenType?: string; authVersion?: number }) {
    if (payload.tokenType && payload.tokenType !== 'access') {
      throw new UnauthorizedException('Token invalide');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { gym: true },
    });
    if (!user || !user.actif) throw new UnauthorizedException('Compte inactif ou introuvable');
    if ((payload.authVersion ?? 0) !== (user.authVersion ?? 0)) throw new UnauthorizedException('Session révoquée. Reconnectez-vous.');
    return user;
  }
}
