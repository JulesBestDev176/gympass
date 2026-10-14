import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
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
  adminCreate(@Body() body: CreateUserDto & { gymId: string }) {
    const { gymId, ...dto } = body;
    return this.usersService.create(gymId, dto);
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
    return this.usersService.update(user.gymId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
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
