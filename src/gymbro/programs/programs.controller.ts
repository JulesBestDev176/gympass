import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('gymbro/programs')
export class ProgramsController {
  constructor(private readonly service: ProgramsService) {}

  @Post('enroll')
  @UseGuards(GymbroJwtGuard)
  enroll(@Req() req: any) {
    return this.service.enroll(req.user.id);
  }

  // Aperçu public (non abonné) — limité semaine 1
  @Get(':id/preview')
  @UseGuards(GymbroJwtGuard)
  preview(@Param('id') id: string) {
    return this.service.preview(id);
  }

  // Programme complet (abonné)
  @Get(':id')
  @UseGuards(GymbroJwtGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Admin — liste complète
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateProgramDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() dto: Partial<CreateProgramDto>) {
    return this.service.update(id, dto);
  }

  @Patch(':id/toggle')
  @UseGuards(AuthGuard('jwt'))
  toggle(@Param('id') id: string) {
    return this.service.toggleActif(id);
  }
}
