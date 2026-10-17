import { ExercisesService } from '../exercises/exercises.service';
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProgramDto } from './dto/create-program.dto';

const FULL_PROGRAM_INCLUDE = {
  phases: {
    orderBy: { numero: 'asc' as const },
    include: {
      weeks: {
        orderBy: { numero: 'asc' as const },
        include: {
          sessions: {
            orderBy: { numero: 'asc' as const },
            include: {
              exercises: {
                orderBy: { ordre: 'asc' as const },
                include: { exercise: true },
              },
            },
          },
        },
      },
    },
  },
};

@Injectable()
export class ProgramsService {
  constructor(private readonly prisma: PrismaService, private readonly exercises: ExercisesService) {}

  async findAll(actif?: boolean) {
    return this.prisma.gymbroProgram.findMany({
      where: actif !== undefined ? { actif } : {},
      orderBy: { nom: 'asc' },
    });
  }

  async findOne(id: string) {
    const program = await this.prisma.gymbroProgram.findUnique({
      where: { id },
      include: FULL_PROGRAM_INCLUDE,
    });
    if (!program) throw new NotFoundException('Programme introuvable');
    return this.exercises.publishedProgram(program);
  }

  // Aperçu limité — semaine 1 seulement, sans les charges
  async preview(id: string) {
    const program = await this.prisma.gymbroProgram.findUnique({
      where: { id, actif: true },
      include: {
        phases: {
          take: 1,
          include: {
            weeks: {
              take: 1,
              include: {
                sessions: {
                  include: {
                    exercises: {
                      take: 3,
                      include: { exercise: { select: { nomFr: true, groupeMusculaire: true, actif: true, mediaSource: true, mediaSourceId: true, mediaSourceRevision: true } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!program) throw new NotFoundException('Programme introuvable');
    return this.exercises.publishedProgram(program);
  }

  async create(dto: CreateProgramDto) {
    const { phases, ...programData } = dto;

    return this.prisma.gymbroProgram.create({
      data: {
        ...programData,
        nbSemaines: programData.nbSemaines ?? 12,
        phases: phases
          ? {
              create: phases.map((phase) => ({
                numero: phase.numero,
                nom: phase.nom,
                description: phase.description,
                weeks: {
                  create: phase.weeks.map((week) => ({
                    numero: week.numero,
                    estDecharge: week.estDecharge ?? false,
                    sessions: {
                      create: week.sessions.map((session) => ({
                        numero: session.numero,
                        nom: session.nom,
                        description: session.description,
                        exercises: {
                          create: session.exercises.map((ex) => ({
                            exerciseId: ex.exerciseId,
                            ordre: ex.ordre,
                            nbSeries: ex.nbSeries,
                            repsMin: ex.repsMin,
                            repsMax: ex.repsMax,
                            tempsReposSec: ex.tempsReposSec ?? 90,
                            chargeDepart: ex.chargeDepart,
                            notes: ex.notes,
                          })),
                        },
                      })),
                    },
                  })),
                },
              })),
            }
          : undefined,
      },
      include: FULL_PROGRAM_INCLUDE,
    });
  }

  async update(id: string, data: Partial<CreateProgramDto>) {
    await this.findOne(id);
    const { phases, ...rest } = data;
    return this.prisma.gymbroProgram.update({ where: { id }, data: rest });
  }

  async toggleActif(id: string) {
    const p = await this.findOne(id);
    return this.prisma.gymbroProgram.update({ where: { id }, data: { actif: !p.actif } });
  }

  async enroll(userId: string) {
    // Check active subscription
    const sub = await this.prisma.gymbroSubscription.findFirst({
      where: { userId, statut: 'ACTIVE', dateExpiration: { gt: new Date() } },
    });
    if (!sub) throw new ForbiddenException('Abonnement actif requis pour s\'inscrire au programme');

    // Check existing active userProgram
    const existing = await this.prisma.gymbroUserProgram.findFirst({
      where: { userId, actif: true },
      include: { program: true },
    });
    if (existing) return { userProgramId: existing.id, programId: existing.programId, alreadyEnrolled: true };

    // Get matched program
    const profile = await this.prisma.gymbroUserProfile.findUnique({ where: { userId } });
    if (!profile?.matchingProgramId) throw new BadRequestException('Aucun programme matché. Lance le questionnaire d\'abord.');

    // Create userProgram
    const userProgram = await this.prisma.gymbroUserProgram.create({
      data: { userId, programId: profile.matchingProgramId, actif: true },
    });

    return { userProgramId: userProgram.id, programId: userProgram.programId, alreadyEnrolled: false };
  }
}
