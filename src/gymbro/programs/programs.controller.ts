import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { AuthGuard } from '@nestjs/passport';
import { EditorialStatus } from '@prisma/client';

@Controller('gymbro/programs')
export class ProgramsController {
  constructor(private readonly service: ProgramsService) {}

  // ─── Admin routes (GymDash JWT) ─────────────────────────────────────────────

  @Get('admin')
  @UseGuards(AuthGuard('jwt'))
  findAllAdmin(
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAllAdmin(status, page ? parseInt(page, 10) : 1);
  }

  @Get('admin/:id')
  @UseGuards(AuthGuard('jwt'))
  findOneAdmin(@Param('id') id: string) {
    return this.service.findOneAdmin(id);
  }

  @Post('admin/:id/review')
  @UseGuards(AuthGuard('jwt'))
  submitReview(
    @Param('id') id: string,
    @Body() body: { checksum?: string; actorId?: string },
  ) {
    return this.service.transitionStatus(id, EditorialStatus.COACH_REVIEW, body.checksum, body.actorId);
  }

  @Post('admin/:id/validate')
  @UseGuards(AuthGuard('jwt'))
  validate(
    @Param('id') id: string,
    @Body() body: { checksum?: string; actorId?: string },
  ) {
    return this.service.transitionStatus(id, EditorialStatus.VALIDATED, body.checksum, body.actorId);
  }

  @Post('admin/:id/publish')
  @UseGuards(AuthGuard('jwt'))
  publish(
    @Param('id') id: string,
    @Body() body: { checksum?: string; actorId?: string },
  ) {
    return this.service.transitionStatus(id, EditorialStatus.PUBLISHED, body.checksum, body.actorId);
  }

  @Post('admin/:id/retire')
  @UseGuards(AuthGuard('jwt'))
  retire(
    @Param('id') id: string,
    @Body() body: { checksum?: string; actorId?: string },
  ) {
    return this.service.transitionStatus(id, EditorialStatus.RETIRED, body.checksum, body.actorId);
  }

  @Post('admin/:id/clone-version')
  @UseGuards(AuthGuard('jwt'))
  cloneVersion(@Param('id') id: string) {
    return this.service.cloneVersion(id);
  }

  // ─── Mobile routes (GymBro JWT) ─────────────────────────────────────────────

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
