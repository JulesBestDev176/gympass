-- Supprimer le qrCode de session_cards (chaque adhérent a une seule carte)
-- Supprimer l'index unique sur qrCode
DROP INDEX IF EXISTS "session_cards_qrCode_key";

-- Supprimer la colonne qrCode
ALTER TABLE "session_cards" DROP COLUMN IF EXISTS "qrCode";

-- Rendre memberId unique (une seule carte par adhérent)
-- D'abord supprimer les doublons en gardant la carte la plus récente par membre
DELETE FROM "session_cards"
WHERE id NOT IN (
  SELECT DISTINCT ON ("memberId") id
  FROM "session_cards"
  ORDER BY "memberId", "createdAt" DESC
);

-- Ajouter la contrainte unique sur memberId
ALTER TABLE "session_cards" ADD CONSTRAINT "session_cards_memberId_key" UNIQUE ("memberId");
