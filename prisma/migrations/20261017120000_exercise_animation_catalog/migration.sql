ALTER TABLE "gymbro_exercises"
  ADD COLUMN "mediaSource" TEXT,
  ADD COLUMN "mediaSourceId" TEXT,
  ADD COLUMN "mediaSourceRevision" TEXT,
  ADD COLUMN "animationReviewedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "gymbro_exercises_mediaSource_mediaSourceId_key"
  ON "gymbro_exercises"("mediaSource", "mediaSourceId");
