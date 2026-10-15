import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';

@Injectable()
export class ExercisesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actif?: boolean) {
    return this.prisma.gymbroExercise.findMany({
      where: actif !== undefined ? { actif } : {},
      orderBy: [{ groupeMusculaire: 'asc' }, { nomFr: 'asc' }],
    });
  }

  async findOne(id: string) {
    const ex = await this.prisma.gymbroExercise.findUnique({ where: { id } });
    if (!ex) throw new NotFoundException('Exercice introuvable');
    return ex;
  }

  async create(dto: CreateExerciseDto) {
    return this.prisma.gymbroExercise.create({ data: dto });
  }

  async update(id: string, dto: Partial<CreateExerciseDto>) {
    await this.findOne(id);
    return this.prisma.gymbroExercise.update({ where: { id }, data: dto });
  }

  async toggle(id: string) {
    const ex = await this.findOne(id);
    return this.prisma.gymbroExercise.update({
      where: { id },
      data: { actif: !ex.actif },
    });
  }
}
