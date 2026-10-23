import { UserRole } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { BraceletsService } from './bracelets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsInt, Min, Max } from 'class-validator';
import { BraceletEntriesQuery } from './bracelet-entries.dto';
import { BraceletLookupDto, CreateBraceletSaleDto } from './bracelet-sale.dto';

class GenerateDto {
  @IsInt() @Min(1) @Max(100) count: number;
}

@UseGuards(JwtAuthGuard)
@Controller('bracelets')
export class BraceletsController {
  constructor(private readonly service: BraceletsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.gymId);
  }

  @Post('lookup')
  lookup(@CurrentUser() user: any, @Body() dto: BraceletLookupDto) { return this.service.lookup(user.gymId, dto.qrCode); }

  @Post('sales')
  sell(@CurrentUser() user: any, @Body() dto: CreateBraceletSaleDto) { return this.service.sell(user.gymId, user.id, dto); }

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  generate(@CurrentUser() user: any, @Body() dto: GenerateDto) {
    return this.service.generate(user.gymId, dto.count);
  }

  @Patch(':id/toggle')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.toggle(user.gymId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: any) {
    return this.service.getStats(user.gymId);
  }

  @Get('entries')
  entries(@CurrentUser() user: any, @Query() query: BraceletEntriesQuery) {
    return this.service.findEntries(user.gymId, query);
  }
}
