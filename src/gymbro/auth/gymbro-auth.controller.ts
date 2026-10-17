import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { GymbroAuthService } from './gymbro-auth.service';
import { GymbroInitRegisterDto, GymbroConfirmOtpDto } from './dto/register.dto';
import { GymbroLoginDto } from './dto/login.dto';
import { GymbroJwtGuard } from './guards/gymbro-jwt.guard';

@Controller('gymbro/auth')
export class GymbroAuthController {
  constructor(private readonly authService: GymbroAuthService) {}

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
}
