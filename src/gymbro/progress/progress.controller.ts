import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards, Req,
} from '@nestjs/common';
import { ProgressService } from './progress.service';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { GymbroSubscriptionGuard } from '../subscriptions/guards/subscription.guard';

@Controller('gymbro/progress')
@UseGuards(GymbroJwtGuard, GymbroSubscriptionGuard)
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  @Get('overview')
  overview(@Req() req: any, @Query('userProgramId') userProgramId: string) {
    return this.service.getOverview(req.user.id, userProgramId);
  }

  @Get('exercise/:exerciseId')
  exerciseHistory(@Req() req: any, @Param('exerciseId') exerciseId: string) {
    return this.service.getExerciseHistory(req.user.id, exerciseId);
  }

  // Poids
  @Post('weight')
  addWeight(@Req() req: any, @Body('poidsKg') poidsKg: number, @Body('note') note?: string) {
    return this.service.addWeightLog(req.user.id, poidsKg, note);
  }

  @Get('weight')
  getWeight(@Req() req: any) {
    return this.service.getWeightLogs(req.user.id);
  }

  // Photos
  @Post('photos')
  addPhoto(
    @Req() req: any,
    @Body('url') url: string,
    @Body('angle') angle: 'FACE' | 'PROFIL' | 'DOS',
  ) {
    return this.service.addPhoto(req.user.id, url, angle);
  }

  @Get('photos')
  getPhotos(@Req() req: any) {
    return this.service.getPhotos(req.user.id);
  }

  @Delete('photos/:id')
  deletePhoto(@Req() req: any, @Param('id') id: string) {
    return this.service.deletePhoto(req.user.id, id);
  }

  // Bilans
  @Get('bilans')
  getBilans(@Req() req: any) {
    return this.service.getBilans(req.user.id);
  }

  @Get('bilans/:id')
  getBilan(@Req() req: any, @Param('id') id: string) {
    return this.service.getBilan(req.user.id, id);
  }
}
