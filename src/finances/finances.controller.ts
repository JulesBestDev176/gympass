import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FinancesQuery } from './finances.dto';
import { FinancesService } from './finances.service';

@UseGuards(JwtAuthGuard)
@Controller('finances')
export class FinancesController {
  constructor(private readonly service: FinancesService) {}

  @Get('summary')
  summary(@CurrentUser() user: any) {
    return this.service.summary(user);
  }

  @Get()
  find(@CurrentUser() user: any, @Query() query: FinancesQuery) {
    return this.service.find(user, query);
  }
}
