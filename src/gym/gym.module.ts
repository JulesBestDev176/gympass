import { Module } from '@nestjs/common';
import { GymService } from './gym.service';
import { GymController } from './gym.controller';

@Module({ controllers: [GymController], providers: [GymService], exports: [GymService] })
export class GymModule {}
