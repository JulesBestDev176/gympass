import { Controller, Get, Post, Patch, Param, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsString } from 'class-validator';
import { UsersService } from './users.service';
import { AdminCreateUserDto, AdminStaffActionDto, AdminStaffContactDto, AdminUpdateUserDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GymDashGuard } from '../auth/guards/gymdash.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GymDash super-admin — créer un user dans n'importe quelle salle ──────────
  @UseGuards(GymDashGuard)
  @Post('admin-create')
  adminCreate(@Body() body: AdminCreateUserDto) {
    const { gymId, ...dto } = body;
    return this.usersService.create(gymId, dto);
  }

  @UseGuards(GymDashGuard)
  @Patch('admin/:id/contact')
  adminContact(@Param('id') id: string, @Body() dto: AdminStaffContactDto) {
    return this.usersService.update(dto.gymId, id, { telephone: dto.telephone });
  }

  @UseGuards(GymDashGuard)
  @Patch('admin/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.usersService.adminUpdate(dto.gymId, id, dto);
  }

  @UseGuards(GymDashGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('admin/:id/reset-password')
  adminRenewPassword(@Param('id') id: string, @Body() dto: AdminStaffActionDto) {
    return this.usersService.renewPassword(dto.gymId, id);
  }

  // ── JWT authentifié ──────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.usersService.findAll(user.gymId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('gerants')
  findGerants(@CurrentUser() user: any) {
    return this.usersService.findGerants(user.gymId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.usersService.findOne(user.gymId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.findOne(user.gymId, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(user.gymId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    if (dto.telephone !== undefined) throw new ForbiddenException('Le numéro de récupération doit être modifié par l’administration GymDash.');
    return this.usersService.update(user.gymId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (dto.telephone !== undefined) throw new ForbiddenException('Le numéro de récupération doit être modifié par l’administration GymDash.');
    return this.usersService.update(user.gymId, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/toggle')
  toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.toggle(user.gymId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/fcm-token')
  updateFcmToken(@CurrentUser() user: any, @Body('fcmToken') fcmToken: string) {
    return this.usersService.updateFcmToken(user.id, fcmToken);
  }
}
