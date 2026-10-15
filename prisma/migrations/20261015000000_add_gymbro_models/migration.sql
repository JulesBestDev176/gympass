-- GymBro — Ajout des modèles mobiles

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "GymbroObjectif" AS ENUM ('PRISE_DE_MASSE', 'FORCE', 'REMISE_EN_FORME', 'AUTRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroNiveau" AS ENUM ('DEBUTANT', 'QUELQUES_MOIS', 'PLUS_D_UN_AN', 'INTERMEDIAIRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroTypeEquipement" AS ENUM ('SALLE_COMPLETE', 'SALLE_BASIQUE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroPreferenceEquipement" AS ENUM ('MACHINES', 'HALTERES_BARRES', 'MIXTE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroMatchingStatus" AS ENUM ('PENDING', 'MATCHED', 'NO_MATCH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'POSTPONED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroSetStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "GymbroPhotoAngle" AS ENUM ('FACE', 'PROFIL', 'DOS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable: gymbro_users
CREATE TABLE IF NOT EXISTS "gymbro_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_users_email_key" ON "gymbro_users"("email");

-- CreateTable: gymbro_user_profiles
CREATE TABLE IF NOT EXISTS "gymbro_user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectifPrincipal" "GymbroObjectif",
    "objectifSecondaire" "GymbroObjectif",
    "descriptionPhysique" TEXT,
    "age" INTEGER,
    "tailleCm" INTEGER,
    "poidsKg" DOUBLE PRECISION,
    "dateDernierePesee" TIMESTAMP(3),
    "poidsSouhaiteKg" DOUBLE PRECISION,
    "seancesParSemaine" INTEGER,
    "dureeMaxSeanceMin" INTEGER,
    "joursPreferesJson" TEXT,
    "changementPrevu" BOOLEAN NOT NULL DEFAULT false,
    "dateChangement" TIMESTAMP(3),
    "seancesApresChangement" INTEGER,
    "niveauExperience" "GymbroNiveau",
    "typeEquipement" "GymbroTypeEquipement",
    "preferenceEquipement" "GymbroPreferenceEquipement",
    "performancesJson" TEXT,
    "allerEchec" BOOLEAN,
    "douleurs" TEXT,
    "blessures" TEXT,
    "heuresSommeil" DOUBLE PRECISION,
    "niveauFatigue" INTEGER,
    "restrictionMedicale" BOOLEAN NOT NULL DEFAULT false,
    "matchingStatus" "GymbroMatchingStatus" NOT NULL DEFAULT 'PENDING',
    "matchingProgramId" TEXT,
    "questionnaireComplet" BOOLEAN NOT NULL DEFAULT false,
    "etapeActuelle" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_user_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gymbro_user_profiles_userId_key" ON "gymbro_user_profiles"("userId");

-- CreateTable: gymbro_exercises
CREATE TABLE IF NOT EXISTS "gymbro_exercises" (
    "id" TEXT NOT NULL,
    "nomFr" TEXT NOT NULL,
    "descriptionFr" TEXT,
    "instructionsFrJson" TEXT,
    "groupeMusculaire" TEXT NOT NULL,
    "musclesPrimairesJson" TEXT NOT NULL,
    "musclesSecondairesJson" TEXT,
    "equipementRequis" TEXT NOT NULL,
    "difficulte" TEXT,
    "photoExerciceUrl" TEXT,
    "photoMuscleUrl" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable: gymbro_programs
CREATE TABLE IF NOT EXISTS "gymbro_programs" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "objectif" "GymbroObjectif" NOT NULL,
    "niveauMin" "GymbroNiveau" NOT NULL,
    "niveauMax" "GymbroNiveau" NOT NULL,
    "seancesParSemaine" INTEGER NOT NULL,
    "typeEquipement" "GymbroTypeEquipement" NOT NULL DEFAULT 'SALLE_COMPLETE',
    "dureeSeanceMin" INTEGER NOT NULL,
    "nbSemaines" INTEGER NOT NULL DEFAULT 12,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: gymbro_program_phases
CREATE TABLE IF NOT EXISTS "gymbro_program_phases" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_program_phases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_program_phases_programId_idx" ON "gymbro_program_phases"("programId");

-- CreateTable: gymbro_program_weeks
CREATE TABLE IF NOT EXISTS "gymbro_program_weeks" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estDecharge" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_program_weeks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_program_weeks_phaseId_idx" ON "gymbro_program_weeks"("phaseId");

-- CreateTable: gymbro_program_sessions
CREATE TABLE IF NOT EXISTS "gymbro_program_sessions" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_program_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_program_sessions_weekId_idx" ON "gymbro_program_sessions"("weekId");

-- CreateTable: gymbro_session_exercises
CREATE TABLE IF NOT EXISTS "gymbro_session_exercises" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "nbSeries" INTEGER NOT NULL,
    "repsMin" INTEGER NOT NULL,
    "repsMax" INTEGER NOT NULL,
    "tempsReposSec" INTEGER NOT NULL DEFAULT 90,
    "chargeDepart" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_session_exercises_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_session_exercises_sessionId_idx" ON "gymbro_session_exercises"("sessionId");
CREATE INDEX IF NOT EXISTS "gymbro_session_exercises_exerciseId_idx" ON "gymbro_session_exercises"("exerciseId");

-- CreateTable: gymbro_user_programs
CREATE TABLE IF NOT EXISTS "gymbro_user_programs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_user_programs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_user_programs_userId_idx" ON "gymbro_user_programs"("userId");

-- CreateTable: gymbro_user_sessions
CREATE TABLE IF NOT EXISTS "gymbro_user_sessions" (
    "id" TEXT NOT NULL,
    "userProgramId" TEXT NOT NULL,
    "programSessionId" TEXT NOT NULL,
    "statut" "GymbroSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "datePrevue" TIMESTAMP(3),
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_user_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_user_sessions_userProgramId_idx" ON "gymbro_user_sessions"("userProgramId");

-- CreateTable: gymbro_user_sets
CREATE TABLE IF NOT EXISTS "gymbro_user_sets" (
    "id" TEXT NOT NULL,
    "userSessionId" TEXT NOT NULL,
    "sessionExerciseId" TEXT NOT NULL,
    "numeroSerie" INTEGER NOT NULL,
    "chargeProposee" DOUBLE PRECISION,
    "chargeAcceptee" DOUBLE PRECISION,
    "chargeRealisee" DOUBLE PRECISION,
    "repsRealisees" INTEGER,
    "statut" "GymbroSetStatus" NOT NULL DEFAULT 'PENDING',
    "difficulte" INTEGER,
    "douleur" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_user_sets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_user_sets_userSessionId_idx" ON "gymbro_user_sets"("userSessionId");
CREATE INDEX IF NOT EXISTS "gymbro_user_sets_sessionExerciseId_idx" ON "gymbro_user_sets"("sessionExerciseId");

-- CreateTable: gymbro_subscriptions
CREATE TABLE IF NOT EXISTS "gymbro_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statut" "GymbroSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateExpiration" TIMESTAMP(3) NOT NULL,
    "readOnlyUntil" TIMESTAMP(3),
    "montantFcfa" INTEGER NOT NULL,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "gymbro_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_subscriptions_userId_idx" ON "gymbro_subscriptions"("userId");
CREATE INDEX IF NOT EXISTS "gymbro_subscriptions_dateExpiration_idx" ON "gymbro_subscriptions"("dateExpiration");

-- CreateTable: gymbro_weight_logs
CREATE TABLE IF NOT EXISTS "gymbro_weight_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "poidsKg" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "gymbro_weight_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_weight_logs_userId_idx" ON "gymbro_weight_logs"("userId");

-- CreateTable: gymbro_photos
CREATE TABLE IF NOT EXISTS "gymbro_photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "angle" "GymbroPhotoAngle" NOT NULL DEFAULT 'FACE',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_photos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_photos_userId_idx" ON "gymbro_photos"("userId");

-- CreateTable: gymbro_bilans
CREATE TABLE IF NOT EXISTS "gymbro_bilans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semaine" INTEGER NOT NULL,
    "seancesTotal" INTEGER NOT NULL,
    "seancesReussies" INTEGER NOT NULL,
    "volumeTotal" DOUBLE PRECISION,
    "poidsDebut" DOUBLE PRECISION,
    "poidsFin" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_bilans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_bilans_userId_idx" ON "gymbro_bilans"("userId");

-- CreateTable: gymbro_program_adjustments
CREATE TABLE IF NOT EXISTS "gymbro_program_adjustments" (
    "id" TEXT NOT NULL,
    "userProgramId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_program_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_program_adjustments_userProgramId_idx" ON "gymbro_program_adjustments"("userProgramId");

-- CreateTable: gymbro_notifications
CREATE TABLE IF NOT EXISTS "gymbro_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gymbro_notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "gymbro_notifications_userId_idx" ON "gymbro_notifications"("userId");

-- AddForeignKeys
ALTER TABLE "gymbro_user_profiles" ADD CONSTRAINT "gymbro_user_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_program_phases" ADD CONSTRAINT "gymbro_program_phases_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "gymbro_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_program_weeks" ADD CONSTRAINT "gymbro_program_weeks_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "gymbro_program_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_program_sessions" ADD CONSTRAINT "gymbro_program_sessions_weekId_fkey"
    FOREIGN KEY ("weekId") REFERENCES "gymbro_program_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_session_exercises" ADD CONSTRAINT "gymbro_session_exercises_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "gymbro_program_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_session_exercises" ADD CONSTRAINT "gymbro_session_exercises_exerciseId_fkey"
    FOREIGN KEY ("exerciseId") REFERENCES "gymbro_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gymbro_user_programs" ADD CONSTRAINT "gymbro_user_programs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_user_programs" ADD CONSTRAINT "gymbro_user_programs_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "gymbro_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gymbro_user_sessions" ADD CONSTRAINT "gymbro_user_sessions_userProgramId_fkey"
    FOREIGN KEY ("userProgramId") REFERENCES "gymbro_user_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_user_sessions" ADD CONSTRAINT "gymbro_user_sessions_programSessionId_fkey"
    FOREIGN KEY ("programSessionId") REFERENCES "gymbro_program_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gymbro_user_sets" ADD CONSTRAINT "gymbro_user_sets_userSessionId_fkey"
    FOREIGN KEY ("userSessionId") REFERENCES "gymbro_user_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_user_sets" ADD CONSTRAINT "gymbro_user_sets_sessionExerciseId_fkey"
    FOREIGN KEY ("sessionExerciseId") REFERENCES "gymbro_session_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gymbro_subscriptions" ADD CONSTRAINT "gymbro_subscriptions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_weight_logs" ADD CONSTRAINT "gymbro_weight_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_photos" ADD CONSTRAINT "gymbro_photos_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_bilans" ADD CONSTRAINT "gymbro_bilans_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_program_adjustments" ADD CONSTRAINT "gymbro_program_adjustments_userProgramId_fkey"
    FOREIGN KEY ("userProgramId") REFERENCES "gymbro_user_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gymbro_notifications" ADD CONSTRAINT "gymbro_notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "gymbro_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
