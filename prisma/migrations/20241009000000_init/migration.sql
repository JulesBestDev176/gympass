-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'GERANT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIF', 'EXPIRE_DEMAIN', 'EXPIRE', 'SEANCE_DISPONIBLE', 'SEANCE_CONSOMMEE', 'CARTE_DESACTIVEE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PaymentType" AS ENUM ('ABONNEMENT', 'SEANCE_UNIQUE', 'RECHARGE_CARTE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PaymentMode" AS ENUM ('ESPECES', 'ORANGE_MONEY', 'WAVE', 'CHEQUE', 'VIREMENT', 'AUTRE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "NotifType" AS ENUM ('EXPIRE_DEMAIN', 'EXPIRATION', 'PAIEMENT', 'INSCRIPTION', 'SYSTEME');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "gyms" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ville" TEXT NOT NULL DEFAULT 'Dakar',
    "pays" TEXT NOT NULL DEFAULT 'SN',
    "slug" TEXT NOT NULL,
    "fraisInscription" INTEGER NOT NULL DEFAULT 5000,
    "prixMensualite" INTEGER NOT NULL DEFAULT 25000,
    "dureeMensualite" INTEGER NOT NULL DEFAULT 30,
    "prixSeance" INTEGER NOT NULL DEFAULT 2500,
    "antiDoubleScanSec" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'GERANT',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "photoUrl" TEXT,
    "fcmToken" TEXT,
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "members" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "numeroCarte" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "photoUrl" TEXT,
    "carteActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "formule" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateExpiration" TIMESTAMP(3) NOT NULL,
    "statut" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "session_cards" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "qrCode" TEXT NOT NULL,
    "seancesRestantes" INTEGER NOT NULL DEFAULT 0,
    "seancesTotal" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionCardId" TEXT,
    "type" "PaymentType" NOT NULL,
    "formule" TEXT NOT NULL,
    "montantFcfa" INTEGER NOT NULL,
    "mode" "PaymentMode" NOT NULL DEFAULT 'ESPECES',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "entries" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "formule" TEXT NOT NULL,
    "statut" "SubscriptionStatus" NOT NULL,
    "exceptionnel" BOOLEAN NOT NULL DEFAULT false,
    "motifExceptionnel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "userId" TEXT,
    "titre" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotifType" NOT NULL,
    "lue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "gyms_slug_key" ON "gyms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_gymId_idx" ON "users"("gymId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "members_numeroCarte_key" ON "members"("numeroCarte");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "members_qrCode_key" ON "members"("qrCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "members_gymId_idx" ON "members"("gymId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "members_numeroCarte_idx" ON "members"("numeroCarte");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "members_qrCode_idx" ON "members"("qrCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_memberId_idx" ON "subscriptions"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_dateExpiration_idx" ON "subscriptions"("dateExpiration");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "session_cards_qrCode_key" ON "session_cards"("qrCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "session_cards_memberId_idx" ON "session_cards"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_gymId_idx" ON "payments"("gymId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_memberId_idx" ON "payments"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_userId_idx" ON "payments"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_createdAt_idx" ON "payments"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entries_memberId_idx" ON "entries"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entries_userId_idx" ON "entries"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "entries_createdAt_idx" ON "entries"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_gymId_idx" ON "notifications"("gymId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_lue_idx" ON "notifications"("lue");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "members" ADD CONSTRAINT "members_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "session_cards" ADD CONSTRAINT "session_cards_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_sessionCardId_fkey" FOREIGN KEY ("sessionCardId") REFERENCES "session_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "entries" ADD CONSTRAINT "entries_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "entries" ADD CONSTRAINT "entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
