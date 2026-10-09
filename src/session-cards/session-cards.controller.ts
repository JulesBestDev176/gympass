import { Controller, Get, Post, Patch, Param, UseGuards } from '@nestjs/common';
import { SessionCardsService } from './session-cards.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('session-cards')
export class SessionCardsController {
  constructor(private readonly service: SessionCardsService) {}

  @Get('member/:memberId')
  findByMember(@CurrentUser() user: any, @Param('memberId') memberId: string) {
    return this.service.findByMember(user.gymId, memberId);
  }

  @Post('member/:memberId')
  create(@CurrentUser() user: any, @Param('memberId') memberId: string) {
    return this.service.create(user.gymId, memberId);
  }

  @Patch(':id/toggle')
  toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.toggle(user.gymId, id);
  }
}
