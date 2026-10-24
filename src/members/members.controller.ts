import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';

import { MembersService } from './members.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.membersService.findAll(user.gymId, search);
  }

  @Get('expiring')
  findExpiring(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.membersService.findExpiringSoon(user.gymId, days ? parseInt(days) : 7);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.membersService.findOne(user.gymId, id, user);
  }

  @Get(':id/paid-months')
  getPaidMonths(@CurrentUser() user: any, @Param('id') id: string, @Query('annee') annee?: string) {
    return this.membersService.getPaidMonths(user.gymId, id, annee ? parseInt(annee) : new Date().getFullYear());
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateMemberDto) {
    return this.membersService.create(user.gymId, user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.membersService.update(user.gymId, id, dto);
  }

  @Patch(':id/carte/toggle')
  toggleCarte(@CurrentUser() user: any, @Param('id') id: string) {
    return this.membersService.toggleCarte(user.gymId, id);
  }

  @Post(':id/carte/replace')
  replaceCard(@CurrentUser() user: any, @Param('id') id: string, @Body('motif') motif?: string) {
    return this.membersService.replaceCard(user.gymId, id, motif);
  }
}
