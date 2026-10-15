import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { GymbroAuthService } from './gymbro-auth.service';
import { GymbroRegisterDto } from './dto/register.dto';
import { GymbroLoginDto } from './dto/login.dto';
import { GymbroJwtGuard } from './guards/gymbro-jwt.guard';

@Controller('gymbro/auth')
export class GymbroAuthController {
  constructor(private readonly authService: GymbroAuthService) {}

  @Post('register')
  register(@Body() dto: GymbroRegisterDto) {
    return this.authService.register(dto);
  }

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
