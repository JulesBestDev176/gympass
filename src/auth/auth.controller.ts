import { Controller, Post, Body, UseGuards, Patch } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { IsString, IsEmail, IsNotEmpty, MinLength, Length } from 'class-validator';

class ChangePasswordDto {
  @IsString() @IsNotEmpty() oldPassword: string;
  @IsString() @MinLength(6) newPassword: string;
}

class ForceChangePasswordDto {
  @IsString() @MinLength(6) newPassword: string;
}

class ForgotPasswordDto {
  @IsEmail() email: string;
}

class ResetPasswordDto {
  @IsEmail() email: string;
  @IsString() @Length(6, 6) otp: string;
  @IsString() @MinLength(6) newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('password')
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }

  // Première connexion — mot de passe temporaire → définir le sien
  @UseGuards(JwtAuthGuard)
  @Patch('password/force')
  forceChangePassword(@CurrentUser() user: any, @Body() dto: ForceChangePasswordDto) {
    return this.authService.forceChangePassword(user.id, dto.newPassword);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.otp, dto.newPassword);
  }
}
