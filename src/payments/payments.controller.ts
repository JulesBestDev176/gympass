import { Controller, Get, Post, Body, Query, Param, Res, Headers, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentReceiptService } from './payment-receipt.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService, private readonly receipts: PaymentReceiptService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('memberId') memberId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
  ) {
    return this.paymentsService.findAll(user.gymId, user.id, user.role, memberId, dateDebut, dateFin);
  }

  @Get('stats')
  getStats(@CurrentUser() user: any) {
    return this.paymentsService.getStats(user.gymId, user.id, user.role);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(user.gymId, user.id, dto);
  }

  @Get(':id/receipt')
  async receipt(@CurrentUser() user: any, @Param('id') id: string, @Res() res: any) {
    const { data, bytes } = await this.receipts.pdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="recu-${data.number}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(bytes);
  }

  @Get(':id/receipt-whatsapp')
  receiptStatus(@CurrentUser() user: any, @Param('id') id: string) { return this.receipts.status(user, id); }

  @Post(':id/receipt-whatsapp')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  sendReceipt(@CurrentUser() user: any, @Param('id') id: string, @Headers('x-receipt-resend-of') resendOf?: string) {
    return this.receipts.send(user, id, resendOf);
  }
}
