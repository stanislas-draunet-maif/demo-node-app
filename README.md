# demo-node-app

Application SvelteKit de demonstration, inspiree de la structure et des codes couleurs des autres applications Svelte MAIF du workspace.

Version Node cible: `24`

## Apercu

- SvelteKit avec `@sveltejs/adapter-node`
- image Docker multi-stage basee sur `node:24-alpine`
- publication d'image dans GHCR via GitHub Actions
- deploiement vers Azure Container Apps via `azure/container-apps-deploy-action@v2`

Fichiers de reference:

- [package.json](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/package.json)
- [Dockerfile](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/Dockerfile)
- [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml)
- [deploy-aca.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/deploy-aca.yml)

## Developpement

```sh
npm install
npm run dev
```

Port local par defaut: `5173`

## Verification

```sh
npm run check
npm run lint
```

## Production Node

Build de production:

```sh
npm run build
```

Demarrage du serveur Node genere par SvelteKit:

```sh
PORT=3000 HOST=0.0.0.0 npm run start
```

Port de production recommande: `3000`

Variables utiles:

- `PORT`: port d'ecoute du serveur Node
- `HOST`: interface d'ecoute, par exemple `0.0.0.0`

## Docker

L'image est construite depuis [Dockerfile](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/Dockerfile) en trois etapes:

- installation des dependances
- build SvelteKit
- runtime Node 24 minimal

Execution locale:

```sh
docker build -t demo-node-app .
docker run -p 3000:3000 demo-node-app
```

Caracteristiques de l'image:

- port expose: `3000`
- commande de demarrage: `node build`
- base image: `node:24-alpine`

## GitHub Container Registry

Le workflow [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml) construit l'image Docker et la pousse vers GHCR.

Comportement:

- `pull_request`: build uniquement, sans push
- `push` sur `main`: build + push avec `latest`
- `push` sur tag `v*`: build + push avec les tags Git associes
- `workflow_dispatch`: lancement manuel avec push

Tags produits par defaut:

- tag de branche
- tag Git si present
- tag SHA
- `latest` sur la branche par defaut

Image publiee:

```text
ghcr.io/<owner>/<repo>
```

Prerequis GitHub:

- autoriser `GITHUB_TOKEN` a ecrire dans les packages
- conserver la permission `packages: write` sur le workflow

## Azure Container Apps

Le workflow [deploy-aca.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/deploy-aca.yml) deploie une image deja publiee dans GHCR vers Azure Container Apps via `azure/container-apps-deploy-action@v2`.

Comportement:

- apres un build Docker reussi sur `main`, deploiement automatique en `recette`
- deploiement manuel possible via `workflow_dispatch` vers `recette` ou `production`
- l'image deployee est `ghcr.io/<owner>/<repo>:<tag>`

Configuration ACA actuellement figee dans le workflow:

- resource group: `rg-glaude-xp-maifinno`
- environment ACA: `aca-glaude-xp-maifinno`
- nom d'application de base: `demo-app`
- app recette: `demo-app-re7`
- app production: `demo-app`

Secrets GitHub a definir:

- `GHCR_USERNAME`: compte autorise a tirer depuis GHCR
- `GHCR_TOKEN`: token GHCR avec droit de lecture package
- `GLAUDE_CLUSTER_UAI_LOGIN_CLIENT_ID`
- `GLAUDE_CLUSTER_UAI_LOGIN_TENANT_ID`
- `GLAUDE_CLUSTER_UAI_LOGIN_SUBSCRIPTION_ID`

Permissions GitHub requises sur le workflow:

- `contents: read`
- `packages: read`
- `id-token: write`

Prerequis Azure pour le login OIDC:

- une App Registration Azure correspondant au `client-id`
- une federated credential configuree pour ce depot GitHub
- des droits suffisants sur la resource group `rg-glaude-xp-maifinno`
- un login GitHub Actions via `azure/login@v3`

Configuration appliquee par le deploiement:

- ingress externe
- `targetPort=3000`
- image source `ghcr.io/<owner>/<repo>:<tag>`
- resource group cible `rg-glaude-xp-maifinno`
- environnement ACA `aca-glaude-xp-maifinno`

Declenchement manuel:

- cible `recette` ou `production`
- tag d'image libre, par exemple `latest`, `main` ou un tag SHA publie par le workflow Docker

## Sequence CI/CD

1. Un push sur `main` declenche [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml).
2. L'image est publiee dans GHCR.
3. Le succes de ce workflow declenche [deploy-aca.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/deploy-aca.yml).
4. L'image `latest` est deployee automatiquement sur l'app ACA de recette.
5. Un deploiement manuel peut ensuite cibler la production avec le tag voulu.
