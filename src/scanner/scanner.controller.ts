import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ScannerService } from './scanner.service';
import { ScanDto, ExceptionalEntryDto } from './dto/scan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('scan')
  scan(@CurrentUser() user: any, @Body() dto: ScanDto) {
    return this.scannerService.scan(user.gymId, user.id, dto);
  }

  @Post('exceptional')
  exceptionalEntry(@CurrentUser() user: any, @Body() dto: ExceptionalEntryDto) {
    return this.scannerService.exceptionalEntry(user.gymId, user.id, dto);
  }
}
