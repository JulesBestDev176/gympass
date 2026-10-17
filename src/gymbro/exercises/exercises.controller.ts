import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Res } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto, UpdateExerciseDto, ImportExerciseDto, AttachSourceDto, ReviewExerciseDto } from './dto/create-exercise.dto';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { GymDashGuard } from '../../auth/guards/gymdash.guard';
import { ExerciseCatalogService } from './exercise-catalog.service';
import { createReadStream } from 'fs';

@Controller('gymbro/exercises')
export class ExercisesController {
  constructor(private readonly service: ExercisesService, private readonly catalog: ExerciseCatalogService) {}

  @Get('media/flow/:revision/:file')
  media(@Param('revision') revision: string, @Param('file') file: string, @Res() res: any) {
    const media = this.catalog.media(revision, file);
    if (media.url) return res.redirect(302, media.url);
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = createReadStream(media.path);
    stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
    stream.pipe(res);
  }

  @Get('admin/all')
  @UseGuards(GymDashGuard)
  findAllAdmin(@Query('actif') actif?: string) {
    return this.service.findAll(actif === undefined ? undefined : actif === 'true');
  }

  @Get('admin/catalog')
  @UseGuards(GymDashGuard)
  browseCatalog(@Query() query: Record<string, string>) { return this.service.browseCatalog(query); }

  @Post('admin/import')
  @UseGuards(GymDashGuard)
  importExercise(@Body() dto: ImportExerciseDto) { return this.service.importExercise(dto.sourceId, dto.nomFr); }

  @Post('admin')
  @UseGuards(GymDashGuard)
  create(@Body() dto: CreateExerciseDto) { return this.service.create(dto); }

  @Patch('admin/:id/source')
  @UseGuards(GymDashGuard)
  attachSource(@Param('id') id: string, @Body() dto: AttachSourceDto) { return this.service.attachSource(id, dto.sourceId); }

  @Patch('admin/:id/toggle')
  @UseGuards(GymDashGuard)
  toggle(@Param('id') id: string, @Body() dto: ReviewExerciseDto) { return this.service.toggle(id, dto.reviewed, dto.expectedUpdatedAt); }

  @Patch('admin/:id')
  @UseGuards(GymDashGuard)
  update(@Param('id') id: string, @Body() dto: UpdateExerciseDto) { return this.service.update(id, dto); }

  @Get()
  @UseGuards(GymbroJwtGuard)
  findAll() { return this.service.findAll(true); }

  @Get(':id')
  @UseGuards(GymbroJwtGuard)
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
}
