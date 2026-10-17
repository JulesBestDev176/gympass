-- CreateEnum
CREATE TYPE "GymStatut" AS ENUM ('ACTIF', 'INACTIF', 'SUSPENDU');

-- AlterTable
ALTER TABLE "gyms" ADD COLUMN "statut" "GymStatut" NOT NULL DEFAULT 'ACTIF';
