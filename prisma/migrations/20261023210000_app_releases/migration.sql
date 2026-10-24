BEGIN;
CREATE TYPE "AppReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TABLE "app_releases" (
  "id" TEXT NOT NULL,
  "packageName" TEXT NOT NULL,
  "versionName" TEXT NOT NULL,
  "versionCode" INTEGER NOT NULL,
  "notes" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "status" "AppReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_releases_valid" CHECK ("versionCode" > 0 AND "sizeBytes" > 0 AND "sizeBytes" <= 268435456 AND "packageName" = 'com.gympass.gympass_sn' AND length("sha256") = 64),
  CONSTRAINT "app_releases_publication" CHECK (("status" = 'PUBLISHED') = ("publishedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "app_releases_objectKey_key" ON "app_releases"("objectKey");
CREATE INDEX "app_releases_status_versionCode_idx" ON "app_releases"("status", "versionCode");
CREATE INDEX "app_releases_createdAt_id_idx" ON "app_releases"("createdAt", "id");
CREATE UNIQUE INDEX "app_releases_published_version_unique" ON "app_releases"("versionCode") WHERE "status" = 'PUBLISHED';

COMMIT;
