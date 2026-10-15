import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { GymbroJwtGuard } from '../auth/guards/gymbro-jwt.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('gymbro/exercises')
export class ExercisesController {
  constructor(private readonly service: ExercisesService) {}

  // Utilisateur abonné — liste des exercices actifs
  @Get()
  @UseGuards(GymbroJwtGuard)
  findAll() {
    return this.service.findAll(true);
  }

  @Get(':id')
  @UseGuards(GymbroJwtGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Admin gympass — gestion du catalogue
  @Get('admin/all')
  @UseGuards(AuthGuard('jwt'))
  findAllAdmin(@Query('actif') actif?: string) {
    const filter = actif === undefined ? undefined : actif === 'true';
    return this.service.findAll(filter);
  }

  @Post('admin')
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateExerciseDto) {
    return this.service.create(dto);
  }

  @Patch('admin/:id')
  @UseGuards(AuthGuard('jwt'))
  update(@Param('id') id: string, @Body() dto: Partial<CreateExerciseDto>) {
    return this.service.update(id, dto);
  }

  @Patch('admin/:id/toggle')
  @UseGuards(AuthGuard('jwt'))
  toggle(@Param('id') id: string) {
    return this.service.toggle(id);
  }
}
