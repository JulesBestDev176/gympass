-- CreateEnum
CREATE TYPE "GymbroRole" AS ENUM ('USER', 'COACH');

-- AlterTable
ALTER TABLE "gymbro_users" ADD COLUMN "role" "GymbroRole" NOT NULL DEFAULT 'USER';
