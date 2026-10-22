import { Module } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { ScannerController } from './scanner.controller';
import { MembersModule } from '../members/members.module';
import { BraceletsModule } from '../bracelets/bracelets.module';

@Module({
  imports: [MembersModule, BraceletsModule],
  controllers: [ScannerController],
  providers: [ScannerService],
})
export class ScannerModule {}
