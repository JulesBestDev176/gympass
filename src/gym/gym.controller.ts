import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { GymService, CreateGymDto } from './gym.service';
import { UpdateGymDto, UpdatePricingDto, UpdateStatutDto } from './dto/update-gym.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GymDashGuard } from '../auth/guards/gymdash.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { UsersService } from '../users/users.service';

@Controller('gym')
export class GymController {
  constructor(
    private readonly gymService: GymService,
    private readonly membersService: MembersService,
    private readonly usersService: UsersService,
  ) {}

  // ── GymDash super-admin ──────────────────────────────────────────────────────
  @UseGuards(GymDashGuard)
  @Get('all')
  findAll() {
    return this.gymService.findAll();
  }

  @UseGuards(GymDashGuard)
  @Post()
  create(@Body() dto: CreateGymDto) {
    return this.gymService.create(dto);
  }

  @UseGuards(GymDashGuard)
  @Patch(':id/statut')
  updateStatut(@Param('id') id: string, @Body() dto: UpdateStatutDto) {
    return this.gymService.updateStatut(id, dto);
  }

  @UseGuards(GymDashGuard)
  @Get(':id/members')
  getMembers(@Param('id') id: string, @Query('search') search?: string) {
    return this.membersService.findAll(id, search);
  }

  @UseGuards(GymDashGuard)
  @Get(':id/users')
  getUsers(@Param('id') id: string) {
    return this.usersService.findAll(id);
  }

  // ── JWT authentifié ──────────────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get()
  findMine(@CurrentUser() user: any) {
    return this.gymService.findById(user.gymId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch()
  update(@CurrentUser() user: any, @Body() dto: UpdateGymDto) {
    return this.gymService.update(user.gymId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('pricing')
  updatePricing(@CurrentUser() user: any, @Body() dto: UpdatePricingDto) {
    return this.gymService.updatePricing(user.gymId, dto);
  }
}
