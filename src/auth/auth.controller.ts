import { Controller, Post, Body, UseGuards, Patch, Header } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { IsString, IsEmail, IsNotEmpty, MinLength, Length, MaxLength, Matches } from 'class-validator';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';

class ChangePasswordDto {
  @IsString() @IsNotEmpty() oldPassword: string;
  @IsString() @MinLength(12) @MaxLength(72) newPassword: string;
}

class ForceChangePasswordDto {
  @IsString() @MinLength(12) @MaxLength(72) newPassword: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() email: string;
}

export class VerifyResetOtpDto extends ForgotPasswordDto {
  @IsString() @Matches(/^\d{6}$/) otp: string;
}

export class ResetPasswordDto extends ForgotPasswordDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) resetToken: string;
  @IsString() @MinLength(12) @MaxLength(72) newPassword: string;
  @IsString() @MinLength(12) @MaxLength(72) confirmPassword: string;
}

class RefreshTokenDto {
  @IsString() @IsNotEmpty() refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me')
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id);
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('verify-reset-otp')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 900000 } })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyResetOtp(dto.email, dto.otp);
  }

  @Post('reset-password')
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.resetToken, dto.newPassword, dto.confirmPassword);
  }
}
