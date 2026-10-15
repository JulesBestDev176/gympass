import { GymbroNiveau, GymbroTypeEquipement, GymbroObjectif, GymbroPreferenceEquipement } from '@prisma/client';

export interface UserProfileInput {
  objectifPrincipal: GymbroObjectif;
  niveauExperience: GymbroNiveau;
  typeEquipement: GymbroTypeEquipement;
  seancesParSemaine: number;
  dureeMaxSeanceMin: number;
  preferenceEquipement?: GymbroPreferenceEquipement | null;
}

export interface ProgramCandidate {
  id: string;
  objectif: GymbroObjectif;
  niveauMin: GymbroNiveau;
  niveauMax: GymbroNiveau;
  typeEquipement: GymbroTypeEquipement;
  seancesParSemaine: number;
  dureeSeanceMin: number;
}

const NIVEAU_ORDER: Record<GymbroNiveau, number> = {
  DEBUTANT: 0,
  QUELQUES_MOIS: 1,
  PLUS_D_UN_AN: 2,
  INTERMEDIAIRE: 3,
};

// Compatibilité équipement : SALLE_COMPLETE peut utiliser tout
// SALLE_BASIQUE ne peut utiliser que SALLE_BASIQUE
function equipementCompatible(
  userEquipement: GymbroTypeEquipement,
  programEquipement: GymbroTypeEquipement,
): boolean {
  if (userEquipement === 'SALLE_COMPLETE') return true;
  return programEquipement === 'SALLE_BASIQUE';
}

export function matchPrograms(
  profile: UserProfileInput,
  candidates: ProgramCandidate[],
): Array<{ program: ProgramCandidate; score: number }> {
  const userNiveau = NIVEAU_ORDER[profile.niveauExperience];

  // ── Filtres durs ──────────────────────────────────────────────────────────
  const eligible = candidates.filter((p) => {
    // Objectif exact
    if (p.objectif !== profile.objectifPrincipal) return false;

    // Niveau dans la plage
    const niveauMin = NIVEAU_ORDER[p.niveauMin];
    const niveauMax = NIVEAU_ORDER[p.niveauMax];
    if (userNiveau < niveauMin || userNiveau > niveauMax) return false;

    // Équipement compatible
    if (!equipementCompatible(profile.typeEquipement, p.typeEquipement)) return false;

    // Nombre de séances ± 1 jour de tolérance
    if (Math.abs(p.seancesParSemaine - profile.seancesParSemaine) > 1) return false;

    // Durée séance ≤ durée max utilisateur
    if (p.dureeSeanceMin > profile.dureeMaxSeanceMin) return false;

    return true;
  });

  if (eligible.length === 0) return [];

  // ── Scoring ───────────────────────────────────────────────────────────────
  return eligible
    .map((p) => {
      let score = 100;

      // Séances : correspondance exacte = +20, ±1 = 0
      if (p.seancesParSemaine === profile.seancesParSemaine) score += 20;

      // Durée : plus proche du max = mieux
      const dureeDiff = profile.dureeMaxSeanceMin - p.dureeSeanceMin;
      if (dureeDiff <= 10) score += 15;
      else if (dureeDiff <= 20) score += 8;

      // Niveau : correspondance exacte au niveauMin = +10
      if (NIVEAU_ORDER[p.niveauMin] === userNiveau) score += 10;

      // Équipement : salle complète pour salle complète = +5
      if (p.typeEquipement === profile.typeEquipement) score += 5;

      return { program: p, score };
    })
    .sort((a, b) => b.score - a.score);
}
