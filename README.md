# demo-node-app

Application SvelteKit de demonstration, inspiree de la structure et des codes couleurs des autres applications Svelte MAIF du workspace.

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

```sh
docker build -t demo-node-app .
docker run -p 3000:3000 demo-node-app
```

## Azure Container Apps

Le workflow [deploy-aca.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/deploy-aca.yml) deploie l'image GHCR vers Azure Container Apps, sans manifeste YAML externe.

Comportement:

- apres un build Docker reussi sur `main`, deploiement automatique en `recette`
- deploiement manuel possible via `workflow_dispatch` vers `recette` ou `production`
- l'image deployee est `ghcr.io/<owner>/<repo>:<tag>`

Variables GitHub a definir:

- `ACA_APP_NAME_RE7`
- `ACA_APP_NAME_PROD`
- `AZURE_RESOURCE_GROUP_RE7`
- `AZURE_RESOURCE_GROUP_PROD`
- `AZURE_CONTAINERAPPS_ENV_RE7`
- `AZURE_CONTAINERAPPS_ENV_PROD`

Secrets GitHub a definir:

- `AZURE_CREDENTIALS`: JSON de service principal Azure pour `azure/login`
- `GHCR_USERNAME`: compte autorise a tirer depuis GHCR
- `GHCR_TOKEN`: token GHCR avec droit de lecture package

Configuration appliquee par le workflow:

- ingress externe
- `targetPort=3000`
- `HOST=0.0.0.0`
- `NODE_ENV=production`
- min replicas `1`
- max replicas `2` en recette, `3` en production

## GitHub Container Registry

Le workflow [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml) construit l'image Docker et la pousse vers GHCR.

Comportement:

- `pull_request`: build uniquement, sans push
- `push` sur `main`: build + push avec notamment le tag `latest`
- `push` sur tag `v*`: build + push avec les tags Git associes
- `workflow_dispatch`: lancement manuel avec push

Image publiee:

```text
ghcr.io/<owner>/<repo>
```

Prerequis GitHub:

- autoriser `GITHUB_TOKEN` a ecrire dans les packages
- laisser le workflow avec la permission `packages: write`
