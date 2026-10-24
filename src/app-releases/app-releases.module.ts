import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingAdminGuard } from '../platform-billing/billing-admin.guard';
import { AppReleasesController } from './app-releases.controller';
import { AppReleasesService } from './app-releases.service';
import { ReleaseStorageService } from './release-storage.service';

@Module({ imports: [PrismaModule], controllers: [AppReleasesController], providers: [AppReleasesService, ReleaseStorageService, BillingAdminGuard] })
export class AppReleasesModule {}
