import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GymbroJwtGuard extends AuthGuard('gymbro-jwt') {}
