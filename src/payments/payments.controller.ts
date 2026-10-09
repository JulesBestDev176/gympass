import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@CurrentUser() user: any, @Query('memberId') memberId?: string) {
    return this.paymentsService.findAll(user.gymId, user.id, user.role, memberId);
  }

  @Get('stats')
  getStats(@CurrentUser() user: any) {
    return this.paymentsService.getStats(user.gymId);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.gymId, user.id, dto);
  }
}
