import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { GymService } from './gym.service';
import { UpdateGymDto, UpdatePricingDto } from './dto/update-gym.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('gym')
export class GymController {
  constructor(private readonly gymService: GymService) {}

  @Get()
  findMine(@CurrentUser() user: any) {
    return this.gymService.findById(user.gymId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch()
  update(@CurrentUser() user: any, @Body() dto: UpdateGymDto) {
    return this.gymService.update(user.gymId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('pricing')
  updatePricing(@CurrentUser() user: any, @Body() dto: UpdatePricingDto) {
    return this.gymService.updatePricing(user.gymId, dto);
  }
}
