import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('memberId') memberId?: string,
    @Query('date') date?: string,
  ) {
    return this.entriesService.findAll(user.gymId, memberId, date);
  }

  @Get('today-count')
  countToday(@CurrentUser() user: any) {
    return this.entriesService.countToday(user.gymId);
  }
}
