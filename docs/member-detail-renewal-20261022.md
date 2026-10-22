# Renouvellement depuis la fiche adhérent

La fiche charge les mois déjà payés via `GET /members/:id/paid-months?annee=YYYY`, limité à la salle du compte connecté. Cette route existe sur main et est désormais incluse dans la branche de production isolée.

L’action mensuelle propose le premier mois impayé à partir du prochain renouvellement. Elle vérifie à nouveau les mois avant d’ouvrir le paiement. Changer d’adhérent dans le paiement efface le mois prérempli du précédent.

Cette consultation expose uniquement les identifiants de mois, sans étendre l’historique des montants affiché au personnel. Aucune migration de données n’est requise.
