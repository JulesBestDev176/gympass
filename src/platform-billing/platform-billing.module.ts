import { Module } from '@nestjs/common';
import { PlatformBillingController } from './platform-billing.controller';
import { PlatformBillingService } from './platform-billing.service';
import { BillingAdminGuard } from './billing-admin.guard';
import { PrismaModule } from '../prisma/prisma.module';
@Module({ imports: [PrismaModule], controllers: [PlatformBillingController], providers: [PlatformBillingService, BillingAdminGuard] })
export class PlatformBillingModule {
}
