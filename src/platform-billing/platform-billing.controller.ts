import { Body, Controller, Get, Header, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingAdminGuard } from './billing-admin.guard';
import { PlatformBillingService } from './platform-billing.service';
@Controller('platform-billing')
@UseGuards(JwtAuthGuard, BillingAdminGuard)
export class PlatformBillingController {
    constructor(private readonly billing: PlatformBillingService) { }
    @Header('Cache-Control', 'private, no-store')
    @Get('overview')
    overview() { return this.billing.overview(); }
    @Header('Cache-Control', 'private, no-store')
    @Get('invoices')
    invoices(
    @Query()
    query: any) { return this.billing.invoices(query); }
    @Header('Cache-Control', 'private, no-store')
    @Patch('settings')
    settings(
    @Body()
    body: any) { return this.billing.updateSettings(body); }
    @Header('Cache-Control', 'private, no-store')
    @Put('gyms/:gymId')
    gym(
    @Param('gymId')
    id: string, 
    @Body()
    body: any) { return this.billing.updateGym(id, body); }
    @Header('Cache-Control', 'private, no-store')
    @Post('invoices')
    create(
    @Body()
    body: any, 
    @Req()
    req: any) { return this.billing.createInvoice(body, req.user.id); }
    @Header('Cache-Control', 'private, no-store')
    @Post('invoices/:id/payments')
    payment(
    @Param('id')
    id: string, 
    @Body()
    body: any, 
    @Req()
    req: any) { return this.billing.recordPayment(id, body, req.user.id); }
    @Header('Cache-Control', 'private, no-store')
    @Post('invoices/:id/cancel')
    cancel(
    @Param('id')
    id: string, 
    @Body()
    body: any) { return this.billing.cancelInvoice(id, body); }
    @Header('Cache-Control', 'private, no-store')
    @Get('invoices/:id/pdf')
    async pdf(
    @Param('id')
    id: string, 
    @Res()
    res: any) { const buffer = await this.billing.invoicePdf(id); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="facture-gympass.pdf"'); res.setHeader('Cache-Control', 'private, no-store'); res.send(buffer); }
}
