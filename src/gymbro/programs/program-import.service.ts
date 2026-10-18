import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EditorialStatus } from '@prisma/client';

// Valid transition table
const TRANSITIONS: Record<EditorialStatus, EditorialStatus | null> = {
  DRAFT: EditorialStatus.COACH_REVIEW,
  COACH_REVIEW: EditorialStatus.VALIDATED,
  VALIDATED: EditorialStatus.PUBLISHED,
  PUBLISHED: EditorialStatus.RETIRED,
  RETIRED: null,
};

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  checksum: string;
  issues: ValidationIssue[];
}

@Injectable()
export class ProgramImportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate a program and return a ValidationReport.
   * This performs structural checks on the program structure.
   */
  async validate(programId: string): Promise<ValidationReport> {
    const program = await this.prisma.gymbroProgram.findUnique({
      where: { id: programId },
      include: {
        phases: {
          include: {
            weeks: {
              include: {
                sessions: {
                  include: {
                    exercises: {
                      include: { exercise: true },
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

    const issues: ValidationIssue[] = [];

    // Check phases exist
    if (!program.phases || program.phases.length === 0) {
      issues.push({ code: 'NO_PHASES', path: 'phases', message: 'Le programme ne contient aucune phase' });
    }

    let weekCount = 0;
    for (const phase of program.phases ?? []) {
      for (const week of phase.weeks ?? []) {
        weekCount++;
        if (!week.sessions || week.sessions.length === 0) {
          issues.push({
            code: 'EMPTY_WEEK',
            path: `weeks.${week.numero}`,
            message: `Semaine ${week.numero} ne contient aucune séance`,
          });
        }
        for (const session of week.sessions ?? []) {
          if (!session.exercises || session.exercises.length === 0) {
            issues.push({
              code: 'EMPTY_SESSION',
              path: `weeks.${week.numero}.sessions.${session.numero}`,
              message: `Semaine ${week.numero}, séance "${session.nom}" ne contient aucun exercice`,
            });
          }
          for (const link of session.exercises ?? []) {
            if (!link.exercise?.actif) {
              issues.push({
                code: 'INACTIVE_EXERCISE',
                path: `weeks.${week.numero}.sessions.${session.numero}.exercises.${link.ordre}`,
                message: `Exercice inactif dans semaine ${week.numero}, séance "${session.nom}"`,
              });
            }
            if (!link.exercise?.mediaSource || !link.exercise?.mediaSourceId) {
              issues.push({
                code: 'MISSING_MEDIA',
                path: `weeks.${week.numero}.sessions.${session.numero}.exercises.${link.ordre}`,
                message: `Animation à vérifier pour l'exercice dans semaine ${week.numero}, séance "${session.nom}"`,
              });
            }
          }
        }
      }
    }

    if (weekCount < program.nbSemaines) {
      issues.push({
        code: 'MISSING_WEEKS',
        path: 'weeks',
        message: `Programme attend ${program.nbSemaines} semaines mais n'en a que ${weekCount}`,
      });
    }

    const checksum = program.checksum ?? this.computeChecksum(program);
    const valid = issues.length === 0;

    return { valid, checksum, issues };
  }

  /**
   * Transition a program to a new editorial status.
   */
  async transition(
    programId: string,
    target: EditorialStatus,
    actorId?: string,
    expectedChecksum?: string,
  ) {
    const program = await this.prisma.gymbroProgram.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Programme introuvable');

    const expectedNext = TRANSITIONS[program.editorialStatus];
    if (expectedNext !== target) {
      throw new BadRequestException(
        `Transition invalide : ${program.editorialStatus} → ${target}. Transition autorisée : ${program.editorialStatus} → ${expectedNext ?? '(aucune)'}`,
      );
    }

    // Checksum guard
    if (expectedChecksum && program.checksum && program.checksum !== expectedChecksum) {
      throw new ConflictException(
        'Le programme a été modifié entre-temps. Rechargez avant de publier.',
      );
    }

    // For publish, run validation
    if (target === EditorialStatus.PUBLISHED) {
      const report = await this.validate(programId);
      if (!report.valid) {
        throw new BadRequestException(
          `Publication bloquée : ${report.issues.length} problème(s) détecté(s)`,
        );
      }
    }

    const data: any = {
      editorialStatus: target,
    };
    if (target === EditorialStatus.PUBLISHED) {
      data.publishedAt = new Date();
      data.actif = true;
    }
    if (target === EditorialStatus.RETIRED) {
      data.actif = false;
    }

    return this.prisma.gymbroProgram.update({ where: { id: programId }, data });
  }

  /**
   * Compute a simple checksum for a program (using updatedAt + id).
   */
  computeChecksum(program: { id: string; updatedAt: Date }): string {
    return Buffer.from(`${program.id}:${program.updatedAt.toISOString()}`).toString('base64url');
  }
}
