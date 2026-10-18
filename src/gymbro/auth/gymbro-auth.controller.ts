import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GymbroAuthService } from './gymbro-auth.service';
import { GymbroInitRegisterDto, GymbroConfirmOtpDto } from './dto/register.dto';
import { GymbroLoginDto } from './dto/login.dto';
import { GymbroJwtGuard } from './guards/gymbro-jwt.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GymbroPasswordForgotDto, GymbroPasswordResetDto } from './dto/password-recovery.dto';

/** Guard simple : vérifie le header x-admin-secret contre GYMBRO_ADMIN_SECRET (env) */
@Injectable()
class AdminSecretGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.GYMBRO_ADMIN_SECRET;
    if (!secret) throw new UnauthorizedException('GYMBRO_ADMIN_SECRET non configuré');
    const req = ctx.switchToHttp().getRequest();
    if (req.headers['x-admin-secret'] !== secret) {
      throw new UnauthorizedException('Secret admin invalide');
    }
    return true;
  }
}

@Controller('gymbro/auth')
export class GymbroAuthController {
  constructor(private readonly authService: GymbroAuthService) {}

  @Post('password/forgot')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  forgotPassword(@Body() dto: GymbroPasswordForgotDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password/reset')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  resetPassword(@Body() dto: GymbroPasswordResetDto) {
    return this.authService.resetPassword(dto);
  }

  /** Étape 1 : saisie infos + envoi OTP WhatsApp */
  @Post('register/init')
  initRegister(@Body() dto: GymbroInitRegisterDto) {
    return this.authService.initRegister(dto);
  }

  /** Étape 2 : confirmation OTP → compte activé + tokens */
  @Post('register/confirm')
  confirmOtp(@Body() dto: GymbroConfirmOtpDto) {
    return this.authService.confirmOtp(dto);
  }

  /** Renvoi d'un OTP (code expiré ou non reçu) */
  @Post('register/resend')
  resendOtp(@Body('telephone') telephone: string) {
    return this.authService.resendOtp(telephone);
  }

  /** Connexion par téléphone + mot de passe */
  @Post('login')
  login(@Body() dto: GymbroLoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @Get('me')
  @UseGuards(GymbroJwtGuard)
  me(@Req() req: any) {
    return this.authService.me(req.user.id);
  }

  @Post('logout')
  @UseGuards(GymbroJwtGuard)
  logout(@Req() req: any) {
    return this.authService.logout(req.user.id);
  }

  // ─── Admin / Tests ──────────────────────────────────────────────────────────

  /** DELETE /gymbro/auth/admin/users/by-phone/:telephone
   *  Header requis : x-admin-secret: <GYMBRO_ADMIN_SECRET>
   *  Ex : DELETE /gymbro/auth/admin/users/by-phone/+221777151061
   */
  @Delete('admin/users/by-phone/:telephone')
  @UseGuards(AdminSecretGuard)
  deleteByPhone(@Param('telephone') telephone: string) {
    return this.authService.deleteByTelephone(telephone);
  }

  /** DELETE /gymbro/auth/admin/users/:id
   *  Header requis : x-admin-secret: <GYMBRO_ADMIN_SECRET>
   */
  @Delete('admin/users/:id')
  @UseGuards(AdminSecretGuard)
  deleteById(@Param('id') id: string) {
    return this.authService.deleteById(id);
  }
}
