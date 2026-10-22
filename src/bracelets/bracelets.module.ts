import { Module } from '@nestjs/common';
import { BraceletsService } from './bracelets.service';
import { BraceletsController } from './bracelets.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BraceletsController],
  providers: [BraceletsService],
  exports: [BraceletsService],
})
export class BraceletsModule {}
