import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { StartSessionDto, RecordSetDto, CompleteSessionDto } from './dto/session.dto';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { GymbroSubscriptionGuard } from '../subscriptions/guards/subscription.guard';

@Controller('gymbro/sessions')
@UseGuards(GymbroJwtGuard, GymbroSubscriptionGuard)
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Get('today')
  today(@Req() req: any, @Query('userProgramId') userProgramId: string) {
    return this.service.today(req.user.id, userProgramId);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.id, id);
  }

  @Post('start')
  start(@Req() req: any, @Body() dto: StartSessionDto) {
    return this.service.start(req.user.id, dto);
  }

  @Post(':id/sets')
  recordSet(@Req() req: any, @Param('id') id: string, @Body() dto: RecordSetDto) {
    return this.service.recordSet(req.user.id, id, dto);
  }

  @Post(':id/complete')
  complete(@Req() req: any, @Param('id') id: string, @Body() dto: CompleteSessionDto) {
    return this.service.complete(req.user.id, id, dto);
  }

  @Post(':id/skip')
  skip(@Req() req: any, @Param('id') id: string) {
    return this.service.skip(req.user.id, id);
  }

  @Post(':id/report-difficulty')
  report(@Req() req: any, @Param('id') id: string, @Body('notes') notes: string) {
    return this.service.reportDifficulty(req.user.id, id, notes);
  }
}
