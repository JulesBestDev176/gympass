# Déploiement du module de versions Android — 24 octobre 2026

## Incident corrigé

GymDash local appelait l’API de production. Le contrôle `/api/app-releases/access` recevait `Cannot GET /api/v1/app-releases/admin?limit=20`, car la production utilisait une version antérieure au module APK.

## Livraison ciblée

- Application Coolify : `m3tc4qsecffvu3cfqqcfsspc`.
- Branche : `release/android-apk-20261024`.
- Commit : `f51d80a4da290037a8262a5f09a7f1f598aed275`.
- Déploiement : `r46iseflk5ntvjd2gk53y42o`, terminé.
- Référence précédente : `release/gympass-staff-20261022`, commit `4b7a86c81c8486f2ed8f4304293036d5590e30a3`.
- Sauvegarde PostgreSQL préalable : exécution `rohx5rsnybwduryxcbozfydl`, statut `success`.

Le paquet est basé sur la production précédente : ajout du module APK, dépendance de lecture des manifestes, flux binaires et exemption de facturation réservée à la plateforme. Les autres modifications locales, notamment l’audit d’isolation des salles, n’ont pas été incluses.

Le schéma ne change que par l’ajout de `AppReleaseStatus` et `app_releases`. Le démarrage spécialisé exécute uniquement la migration `20261023210000_app_releases`, puis la marque appliquée. La DDL est transactionnelle ; un schéma partiel ou non enregistré bloque le démarrage. Les migrations futures sans lien avec ce module ne sont pas exécutées et aucun seed n’est lancé.

## Vérifications

- Build de la livraison réussi ; 12 tests ciblés réussis, 1 test PostgreSQL de concurrence non exécuté faute d’instance locale. Le test de manifeste APK compilé était indisponible dans le chemin de fixture de cette livraison isolée ; il avait été exécuté dans le workspace principal auparavant.
- Secret du dashboard local concordant avec la configuration backend ; compte fourni présent dans l’allowlist de plateforme. Aucune valeur secrète consignée ici.
- Après déploiement : `GET https://api.gympass.minifootapp.com/api/v1/health` → 200.
- `GET /api/v1/app-releases/android/latest` → 200, `data.release: null`.
- `GET /api/v1/app-releases/admin?limit=20` sans session → 401.
- Requête authentifiée fournie par l’utilisateur, via `http://localhost:3000/api/app-releases/access` → **200, `{ "allowed": true }`**.

Aucun APK n’a été importé ni publié automatiquement. L’upload complet et l’installation Android ne font pas partie de ces vérifications de déploiement. La publication du dashboard web de production n’a pas été modifiée pendant cette intervention ; le dashboard local utilise maintenant le backend corrigé.
