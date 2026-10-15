import { Controller, Post, Get, UseGuards, Req } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';

@Controller('gymbro/matching')
@UseGuards(GymbroJwtGuard)
export class MatchingController {
  constructor(private readonly service: MatchingService) {}

  @Post('run')
  run(@Req() req: any) {
    return this.service.run(req.user.id);
  }

  @Get('result')
  result(@Req() req: any) {
    return this.service.getResult(req.user.id);
  }
}
