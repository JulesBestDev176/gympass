import { Module } from '@nestjs/common';
import { SessionCardsService } from './session-cards.service';
import { SessionCardsController } from './session-cards.controller';

@Module({ controllers: [SessionCardsController], providers: [SessionCardsService] })
export class SessionCardsModule {}
