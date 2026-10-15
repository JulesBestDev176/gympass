import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('gymbro/subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  // Utilisateur — statut de son abonnement
  @Get('me')
  @UseGuards(GymbroJwtGuard)
  me(@Req() req: any) {
    return this.service.getMySubscription(req.user.id);
  }

  // Utilisateur — résiliation
  @Delete(':id')
  @UseGuards(GymbroJwtGuard)
  cancel(@Req() req: any, @Param('id') id: string) {
    return this.service.cancel(req.user.id, id);
  }

  // Admin — liste de tous les abonnements
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  // Admin — créer un abonnement manuellement (après vérif paiement)
  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateSubscriptionDto, @Req() req: any) {
    return this.service.create(dto, req.user.id);
  }
}
