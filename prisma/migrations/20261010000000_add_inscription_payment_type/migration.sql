-- AlterEnum: add INSCRIPTION to PaymentType
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'INSCRIPTION';

-- AlterEnum: add SANS_ABONNEMENT to SubscriptionStatus
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SANS_ABONNEMENT';
