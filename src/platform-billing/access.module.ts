import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingAccessService } from './access.service';

@Global()
@Module({ imports: [PrismaModule], providers: [BillingAccessService], exports: [BillingAccessService] })
export class BillingAccessModule {}
