ALTER TABLE "gyms" ADD COLUMN "logoUrl" TEXT,
                   ADD COLUMN "brandColor" TEXT;
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_brandColor_hex"
  CHECK ("brandColor" IS NULL OR "brandColor" ~ '^#[0-9A-Fa-f]{6}$');
