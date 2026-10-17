import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GymDashGuard } from '../auth/guards/gymdash.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get()
  getStats(@CurrentUser() user: any) {
    if (user.role === UserRole.ADMIN) {
      return this.dashboardService.getOwnerStats(user.gymId);
    }
    return this.dashboardService.getReceptionistStats(user.gymId);
  }

  @UseGuards(GymDashGuard)
  @Get('global')
  getGlobalStats() {
    return this.dashboardService.getGlobalStats();
  }

  @UseGuards(GymDashGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('global/analytics')
  getGlobalAnalytics(@Query('period') period?: string) {
    return this.analyticsService.getGlobalAnalytics(period);
  }
}
