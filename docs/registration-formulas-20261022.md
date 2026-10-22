# Inscription : formules exclusives

Le formulaire propose une seule formule initiale à la fois :

- `MENSUEL` : encaisse les frais d’inscription configurés et donne accès jusqu’à la fin du mois civil en cours. Aucune mensualité supplémentaire n’est encaissée à cette étape. La mensualité intervient au renouvellement.
- `SEANCES` : encaisse uniquement `nbSeances × prixSeance`, crédite la carte et ne crée aucun paiement de frais d’inscription ni abonnement mensuel.

Un adhérent peut recharger sa carte en séances ensuite, via le parcours de paiement existant.

L’API accepte `formule: {type: "MENSUEL"}` ou `formule: {type: "SEANCES", nbSeances: 10}`. L’absence de formule conserve le comportement mensuel des anciens clients. Une quantité avec la formule mensuelle est refusée. Les tarifs sont calculés côté serveur ; `montantAttendu` protège contre un tarif modifié depuis le récapitulatif.

L’adhérent, sa formule, son paiement et ses crédits sont créés dans une transaction. Le même `registrationRequestId` rejoue la demande existante. Le montant de réponse et la quantité initiale utilisent le paiement initial, même si une recharge a eu lieu depuis. La vérification des doublons de téléphone est limitée à la salle et protégée par le verrou transactionnel de la salle.

Aucune migration de base de données supplémentaire n’est nécessaire.
