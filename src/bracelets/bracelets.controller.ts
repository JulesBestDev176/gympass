import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { BraceletsService } from './bracelets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsInt, Min, Max } from 'class-validator';

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

  @Post('generate')
  generate(@CurrentUser() user: any, @Body() dto: GenerateDto) {
    return this.service.generate(user.gymId, dto.count);
  }

  @Patch(':id/toggle')
  toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.toggle(user.gymId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: any) {
    return this.service.getStats(user.gymId);
  }
}
