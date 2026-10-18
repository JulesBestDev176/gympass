-- Additive questionnaire storage; no user/account changes or global seed.
ALTER TABLE "gymbro_user_profiles" ADD COLUMN IF NOT EXISTS "questionnaireV3" JSONB;
