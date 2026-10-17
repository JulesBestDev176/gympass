import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AnalyticsService } from './analytics.service';

@Module({ controllers: [DashboardController], providers: [DashboardService, AnalyticsService] })
export class DashboardModule {}
