# CI/CD backend GymPass

Le workflow `.github/workflows/ci-cd.yml` reprend la structure de `gympass-site` : validation, construction Docker, publication et déploiement vérifié.

- Pull request vers `main` : tests du script de déploiement, installation, génération et validation Prisma, compilation Nest et vérification de `dist/main.js`. Aucune publication ni mutation Coolify.
- Push sur `main` ou `release/**`, ou lancement manuel : mêmes contrôles, publication de `electronteams/gympass-backend:sha-<SHA complet>`.
- Le déploiement utilise le mode Git/Dockerfile actuellement configuré dans Coolify. Il vérifie que la branche du workflow correspond exactement à celle de production, fixe `git_commit_sha` au commit validé, puis lance et suit le déploiement. L'image Docker Hub est disponible mais n'est pas utilisée par le mode Git actuel.

## Branche actuellement en production

Au 24 octobre 2026 : `release/android-apk-20261024`. Le workflow doit également être présent sur cette branche pour que ses prochains pushes soient contrôlés puis déployés.

`main` contient des migrations et fonctionnalités qui n'ont pas encore été intégrées à cette release. Un push sur `main` construit donc l'image mais ignore explicitement le remplacement de la production. Ce comportement est annoncé dans le journal ; ce n'est pas une erreur d'authentification. Ne pas changer simplement la branche Coolify vers `main` avant de réconcilier ces migrations et les précontrôles de démarrage de la release. Une fois cette réconciliation faite, choisir `main` dans Coolify permet au même workflow de la déployer automatiquement.

## Configuration GitHub Actions

Secrets : `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `COOLIFY_API_TOKEN`.

Variables : `COOLIFY_BASE_URL` (origine du serveur, sans `/api/v1`), `COOLIFY_APP_UUID` (`m3tc4qsecffvu3cfqqcfsspc`). Valeurs configurées à partir du serveur Coolify déclaré dans `.mcp.json`. Le fichier et ses identifiants ne sont jamais committés.

Le précédent pipeline échouait après une construction Docker réussie avec HTTP 401 sur son webhook. Les nouveaux identifiants sont ceux vérifiés sur l'API réelle. `COOLIFY_WEBHOOK` et `COOLIFY_TOKEN` ne sont plus utilisés par ce workflow.

Le déclenchement natif Coolify sur push doit être désactivé pour que la construction validée par Actions précède chaque déploiement. Les exécutions de production sont sérialisées, sans annulation d'un déploiement en cours.

## Validation et reprise

Tests : `node --test scripts/coolify-deploy.test.mjs`. Vérification réelle sans mutation : `COOLIFY_CHECK_ONLY=true node scripts/coolify-deploy.mjs`, avec les secrets et variables ci-dessus et `COOLIFY_DEPLOY_MODE=source` dans l'environnement.

Le script attend le résultat de l'UUID retourné par Coolify avant de vérifier `/api/v1/health`. Il ne prend pas la disponibilité de l'ancien conteneur pour une réussite du nouveau déploiement. Les réponses sensibles ne sont pas imprimées.

Un appel POST/PATCH n'est jamais rejoué automatiquement. Si sa réponse expire, vérifier la file Coolify avant toute relance. Pour revenir à une version précédente, remettre son SHA et sa branche dans Coolify puis redéployer ; vérifier aussi la compatibilité de la base. Le pipeline n'effectue ni retour arrière des migrations ni seed supplémentaire.

Références : [API de déploiement Coolify](https://coolify.io/docs/api/endpoints/deployments/deploy-by-tag-or-uuid), [configuration d'application](https://coolify.io/docs/api/endpoints/applications/update-application-by-uuid).
