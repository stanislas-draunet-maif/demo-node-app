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

Le dossier [deployment/demo-node-app-re7.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/deployment/demo-node-app-re7.yml) sert de base recette et [deployment/demo-node-app.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/deployment/demo-node-app.yml) de base production.

Build et push de l'image:

```sh
docker build -t <registry>/fr-maif-digital/demo-node-app:$(git rev-parse --short HEAD) .
docker push <registry>/fr-maif-digital/demo-node-app:$(git rev-parse --short HEAD)
```

Creation ou mise a jour de l'app Container Apps:

```sh
az containerapp up \
	--name demo-node-app \
	--resource-group <resource-group> \
	--environment <container-app-env> \
	--yaml deployment/demo-node-app-re7.yml \
	--image <registry>/fr-maif-digital/demo-node-app:$(git rev-parse --short HEAD)
```

Mise a jour d'une app existante:

```sh
az containerapp update \
	--name demo-node-app \
	--resource-group <resource-group> \
	--yaml deployment/demo-node-app.yml \
	--image <registry>/fr-maif-digital/demo-node-app:$(git rev-parse --short HEAD)
```

Points importants pour ACA:

- Le conteneur ecoute sur `PORT=3000`.
- Le `targetPort` du manifeste ACA est donc `3000`.
- `HOST=0.0.0.0` est deja force dans l'image.
- Si le registre est prive, il faudra aussi configurer le secret d'authentification du registry sur l'app ACA.
