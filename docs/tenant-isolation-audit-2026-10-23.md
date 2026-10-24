# Audit de séparation des salles GymPass — 23 octobre 2026

## Conclusion

Les routes métier examinées prennent leur salle depuis le compte authentifié relu en base, et filtrent les ressources par cette salle. Les essais HTTP locaux n’ont pas permis à un ADMIN ou GERANT d’une salle de lire ou modifier les ressources d’une autre salle.

L’audit a néanmoins reproduit des défauts de changement de session mobile et de droits financiers internes, corrigés dans le code. **L’isolation complète n’est pas validée : les photos sont encore distribuées par un stockage public sur lien.** Aucun changement de cette intervention n’a été déployé ou installé sur téléphone.

## Problèmes reproduits et correctifs

| Problème | Preuve avant correction | État |
| --- | --- | --- |
| Une réponse du compte A arrivait après connexion de B ; un POST de A refusé en 401 pouvait être rejoué avec le JWT de B | Deux tests mobiles échouaient : réponse de A livrée et seconde création envoyée sous B | Corrigé : propriétaire de requête conservé, rejet des réponses et reprises après changement de compte |
| Le réceptionniste pouvait contourner sa limite financière via `/payments/stats` ou les paiements inclus dans `/members/:id` | Tests des vrais services : absence de filtre `userId` et de semaine sur ces chemins | Corrigé : filtrage commun salle + utilisateur + semaine UTC courante ; l’ADMIN conserve la vue de sa salle |
| Un token push de téléphone pouvait rester attaché à l’ancien compte d’une autre salle | Test : une notification privée de A est envoyée au token désormais utilisé par B | Corrigé : transfert du token dans une transaction sérialisée par token ; déconnexion supprime le rattachement |
| Un utilisateur pouvait marquer lue une notification privée d’un autre utilisateur de sa salle | Le filtre ne contenait que `id` et `gymId` | Corrigé : ajout du destinataire, avec maintien des notifications communes à la salle |
| Le dashboard choisissait une salle, mais l’inscription utilisait `/members`, donc implicitement la salle du compte plateforme ; le paramètre React `gymId` n’était pas envoyé | Revue du formulaire `NewMemberModal` ; test HTTP d’un contexte explicite étranger auparavant accepté | Protection ajoutée : les deux formulaires inscription/mensualité transmettent `x-gympass-gym-id` ; la garde refuse un contexte différent. Cela bloque le mélange silencieux, sans ouvrir de droit inter-salles |
| L’ancien scan distinguait un QR d’une autre salle d’un QR inexistant | HTTP : retour 400 « autre gym » au lieu de 404 | Durci : recherche directement limitée à la salle ; même réponse introuvable. Le helper QR des adhérents exige aussi une salle |

Le dashboard central conserve ses accès inter-salles explicitement autorisés et protégés par **JWT + rôle ADMIN + email de plateforme autorisé + secret serveur**. Un administrateur de salle, même muni du secret de test, est refusé. Une inscription ou un encaissement depuis une fiche de salle du dashboard avec un compte rattaché à une autre salle est désormais refusé : un véritable parcours financier plateforme nécessiterait une conception explicite de l’agent collecteur et de la salle cible.

## Point important ouvert : photos

`src/upload/upload.service.ts` crée le bucket de photos avec une politique `s3:GetObject` anonyme sur tous les objets. Les URL contiennent un UUID, mais **connaître une URL suffit pour lire la photo, sans vérification de salle ou de session**. Le caractère aléatoire d’une adresse n’est pas une autorisation.

Cette propriété est confirmée dans la configuration générée par le code ; l’état et la politique réelle du bucket de production n’ont pas été interrogés. Les cartes et reçus WhatsApp sont envoyés comme pièces jointes, mais la génération des reçus lit aussi les photos par leur URL publique.

Pour fermer ce point sans casser les cartes, reçus et anciennes applications :

1. Introduire un stockage privé de photos associé à la salle propriétaire, y compris pour les photos déjà présentes.
2. Servir les photos après autorisation de salle et de compte, et adapter les lecteurs Flutter, le dashboard et la génération serveur de badges/reçus.
3. Conserver l’envoi WhatsApp en pièce jointe ; ne pas rendre public le bucket pour cet envoi.
4. Migrer les références existantes, tester les anciennes données et le cache mobile, puis retirer l’accès anonyme du stockage avec un déploiement coordonné.

Ce chantier n’a pas été appliqué à moitié : fermer le bucket seul couperait les photos dans les applications installées.

## Périmètre vérifié

| Domaine | Frontière observée |
| --- | --- |
| Adhérents et recherche | `user.gymId`, détails/modification/carte filtrés par `id + gymId` |
| Personnel | Liste par salle ; lecture/modification/renouvellement par `id + gymId` ; gestion réservée à ADMIN |
| Paiements et reçus | Salle authentifiée ; adhérent vérifié dans cette salle ; reçus par salle et droits du collecteur |
| Finances | Les deux branches SQL paiements/bracelets sont liées au même `user.gymId` ; réceptionniste limité à ses opérations de la semaine |
| Bracelets et ventes | QR et identifiants limités à la salle, lots sélectionnés dans cette salle, curseurs vérifiés dans ce périmètre |
| Scanner et cartes de séances | Consultation, consommation, création et activation limitées à la salle propriétaire |
| Notifications | Salle + destinataire ; transfert des tokens push au changement de compte |
| Tarifs et compte | Salle du compte courant ; champs supplémentaires `gymId`/`role` écartés lors de l’édition du profil |
| Cache de lecture mobile | Clé salle/utilisateur/rôle, rejet des retours tardifs et des autorisations refusées ; expiration du cache |
| Cache QR hors ligne | Contrôle salle + génération de session après lecture locale |
| File financière hors ligne | Propriétaire salle/utilisateur conservé, clients et requêtes annulés au changement de session, réponses non réattribuées |

Les fonctions globales de planification et de diffusion serveur traversent plusieurs salles intentionnellement. Elles ne constituent pas des routes de consultation ouvertes à un compte de salle.

## Validation et limites

Résultat final : **78 requêtes HTTP locales**, **19 tests backend ciblés réussis**, **15 tests mobiles réussis**. `npm run build` backend terminé avec code 0 ; analyse Dart ciblée sans problème ; `npx tsc --noEmit` du dashboard terminé avec code 0. Aucun APK contenant ces derniers correctifs n’a été construit pendant cet audit.

- `node --test src/tenant-isolation.test.cjs` : matrice HTTP locale avec JWT signés et deux salles synthétiques, gardes et vrais services ; tests de falsification de salle/rôle, accès par identifiant, droits du personnel, reçus, cartes et profils.
- `src/users/tenant-notifications.test.cjs` : les trois reproductions échouaient avant les correctifs.
- `src/payments/payment-visibility.test.cjs` : les deux reproductions échouaient avant les correctifs.
- Mobile : les deux reproductions de `test/tenant_session_boundary_test.dart` échouaient avant le correctif ; vérification avec les tests de renouvellement de session et de cache existants.
- La persistance de la matrice est **simulée** : ce contrôle n’est pas un test d’intégration PostgreSQL ni un test de production. Les paramètres SQL de Finances sont inspectés, sans exécution de ces requêtes sur PostgreSQL. Le verrou PostgreSQL du transfert FCM n’a pas été éprouvé entre plusieurs instances.
- Strix n’est pas installé, Docker n’est pas démarré et aucune clé LLM n’est configurée. Aucun scan Strix n’a été exécuté, aucun dépôt n’a été transmis au cloud, aucune dépense engagée.
- Un élargissement aux anciens tests inscription/renouvellement/scanner révèle **14 échecs déjà présents**. Reproduits avec les services lus directement depuis `git show HEAD:...`, sans remplacer le workspace : anciens fixtures sans `$queryRawUnsafe` ou collecteur, et anciennes attentes de QR de carte. Ces tests ne sont pas présentés comme réussis et n’ont pas été modifiés pour les faire passer.
- Non vérifiés : configuration et politiques de stockage en production, utilisateurs réels, protection de l’infrastructure, restauration des sauvegardes, appareils compromis, RLS PostgreSQL. Aucun audit de ce périmètre ne garantit l’absence de toute vulnérabilité.

Référence méthodologique : [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html), en particulier l’autorisation par ressource, la séparation des caches et les fichiers privés.
