# demo-node-app

Application SvelteKit de démonstration, inspirée de la structure et des codes couleur des autres applications Svelte MAIF de l'espace de travail.

Version cible de Node.js : `24`

## Aperçu

- SvelteKit avec `@sveltejs/adapter-node`
- image Docker multi-stage basée sur `node:24-alpine`
- publication d'image dans GHCR via GitHub Actions
- déploiement vers Azure Container Apps via `az containerapp create`

Fichiers de référence :

- [package.json](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/package.json)
- [Dockerfile](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/Dockerfile)
- [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml)
- [deploy-aca.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/deploy-aca.yml)

## Développement

```sh
npm install
npm run dev
```

Port local par défaut : `5173`

## PostgreSQL et onglet Database

Une base PostgreSQL existante est nécessaire. Aucun serveur PostgreSQL n'est provisionné par l'application.

Compléter le fichier `.env` local (ignoré par Git) avec `DATABASE_URL`. Le fichier `.env.example` fournit un modèle :

```dotenv
DATABASE_URL=postgresql://app:CHANGE_ME@localhost:5432/demo_app
```

Remplacer l'hôte, le port, la base, l'utilisateur et le mot de passe. Encoder les caractères spéciaux des identifiants dans l'URL. Pour une base distante, utiliser TLS avec vérification du certificat, par exemple `?sslmode=verify-full`, et fournir le certificat CA requis par votre hébergeur. Ne pas désactiver la vérification TLS.

`npm run dev` charge automatiquement `.env`. La connexion reste exclusivement côté serveur et ne doit jamais utiliser une variable préfixée `PUBLIC_`.

Au démarrage, l'application teste la connexion et crée `public.informations` si elle n'existe pas : identifiant auto-incrémenté, champ `information` obligatoire (1 à 1000 caractères) et date de création. Le compte PostgreSQL doit pouvoir se connecter à la base, utiliser le schéma `public` et y créer la table. Si elle existe déjà avec un autre propriétaire, il doit aussi avoir les droits SELECT, INSERT, UPDATE, DELETE et les droits nécessaires sur sa séquence. Les créations concurrentes sont sérialisées par un verrou transactionnel. Le build n'a pas besoin de connexion SQL. Cette initialisation ne remplace pas des migrations de schéma.

L'onglet **Database** permet d'ajouter une information, de consulter toutes les lignes, de modifier une ligne et de la supprimer après confirmation. Les doublons sont autorisés. Les formulaires fonctionnent aussi sans JavaScript.

Si la configuration manque ou si PostgreSQL est indisponible, les autres pages restent accessibles. Database affiche une erreur, pas une fausse table vide. Le bouton **Réessayer** tente une nouvelle connexion et initialise la table si nécessaire. Aucune donnée n'est stockée temporairement en mémoire en cas d'échec.

Attention : cette démonstration n'a aucune authentification. Toute personne ayant accès à l'application peut lire, ajouter, modifier et supprimer les informations. Ne pas y stocker de données sensibles ; restreindre l'accès réseau si nécessaire.

## Vérification

```sh
npm run check
npm run lint
```

Tests HTTP PostgreSQL (utiliser une base de test, jamais une base de production) :

```sh
TEST_DATABASE_URL='postgresql://app:mot-de-passe@localhost:5432/demo_test' npm run test:database
```

mot de passe azure `Maif123456!`

Ces tests construisent l'application, démarrent des serveurs temporaires, vérifient l'initialisation concurrente et le CRUD sans JavaScript, puis suppriment uniquement leurs propres lignes. Sans `TEST_DATABASE_URL`, seul le test de démarrage sans configuration s'exécute ; le test avec PostgreSQL est ignoré.

## Production Node

Build de production :

```sh
npm run build
```

Démarrage du serveur Node généré par SvelteKit :

```sh
PORT=3000 HOST=0.0.0.0 npm run start
```

En production, injecter `DATABASE_URL` dans l'environnement du processus. `node build` ne charge pas `.env` automatiquement. Pour essayer le build localement avec ce fichier :

```sh
node --env-file=.env build
```

Port de production recommandé : `3000`

Variables utiles :

- `PORT`: port d'écoute du serveur Node
- `HOST`: interface d'ecoute, par exemple `0.0.0.0`
- `DATABASE_URL`: connexion PostgreSQL privée
- `ORIGIN`: origine publique exacte derrière un reverse proxy, par exemple `https://mon-app.example.com` (sans slash final), pour les formulaires et la protection CSRF

## Docker

L'image est construite depuis [Dockerfile](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/Dockerfile) en trois étapes :

- installation des dépendances
- build SvelteKit
- runtime Node 24 minimal

Exécution locale :

```sh
docker build -t demo-node-app .
docker run --env-file .env -p 3000:3000 demo-node-app
```

Les fichiers `.env` sont exclus du contexte Docker. Depuis un conteneur, `localhost` désigne le conteneur lui-même ; sur macOS, utiliser `host.docker.internal` pour joindre un serveur PostgreSQL sur la machine hôte, ou le nom DNS du serveur distant.

Caractéristiques de l'image :

- port exposé : `3000`
- commande de démarrage : `node build`
- base image: `node:24-alpine`

## GitHub Container Registry

Le workflow [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml) construit l'image Docker et la pousse vers GHCR.

Comportement :

- `pull_request`: build uniquement, sans push
- `push` sur `main`: build + push avec `latest`
- `push` sur tag `v*`: build + push avec les tags Git associés
- `workflow_dispatch`: lancement manuel avec push

Tags produits par défaut :

- tag de branche
- tag Git si présent
- tag SHA
- `latest` sur la branche par défaut

Image publiée :

```text
ghcr.io/<owner>/<repo>
```

Prérequis GitHub :

- autoriser `GITHUB_TOKEN` à écrire dans les packages
- conserver la permission `packages: write` sur le workflow

## Azure Container Apps

Le workflow [deploy-aca.yml](.github/workflows/deploy-aca.yml) exécute systématiquement `az containerapp create`, avec une image déjà publiée dans GHCR. La commande configure le registre avec les identifiants GHCR, l'image, l'ingress externe sur le port 3000 et les six variables runtime via `--env-vars` : `DATABASE_AUTH`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` et `ORIGIN`. Ajouter toute autre variable requise explicitement dans cette liste. Le workflow ne contient ni branche `update`, ni suppression/recréation automatique : si Azure refuse `create` sur une application existante, le déploiement échoue sans solution de repli. L'idempotence sur une application existante n'est pas garantie.

Comportement :

- après un build Docker réussi sur `main`, déploiement automatique en `recette`
- déploiement manuel possible via `workflow_dispatch` vers `recette` ou `production`
- l'image déployée est `ghcr.io/<owner>/<repo>:<tag>`

Configuration ACA actuellement figée dans le workflow :

- resource group: `rg-glaude-xp-maifinno`
- environment ACA: `aca-glaude-xp-maifinno`
- nom d'application de base: `demo-app`
- app recette: `demo-app-re7`
- app production: `demo-app`

Secrets GitHub à définir :

- `GHCR_USERNAME`: compte autorisé à télécharger les images depuis GHCR
- `GHCR_TOKEN`: token GHCR avec droit de lecture package
- `GLAUDE_CLUSTER_UAI_LOGIN_CLIENT_ID`
- `GLAUDE_CLUSTER_UAI_LOGIN_TENANT_ID`
- `GLAUDE_CLUSTER_UAI_LOGIN_SUBSCRIPTION_ID`

Configuration PostgreSQL par environnement GitHub (`recette` et `production`) :

- définir `APP_NAME` et `DOMAINE_NAME` dans le workflow ; l'origine HTTPS est calculée depuis le nom de l'application cible et le domaine, sans variable GitHub `APP_ORIGIN` à configurer ;
- définir la variable GitHub `POSTGRES_RESOURCE_GROUP` au niveau dépôt, ou dans les environnements `recette` et `production`, pour localiser le serveur `pg-glaude-sdx` ;
- effectuer le premier déploiement pour créer l'app et son identité système, puis enregistrer son rôle Entra et exécuter **Provision PostgreSQL** comme indiqué ci-dessous ;
- autoriser les connexions depuis ACA vers PostgreSQL : DNS, réseau, pare-feu, TLS et droits SQL ;
- dimensionner PostgreSQL pour un pool de 5 connexions maximum par processus et tenir compte des réplicas et révisions simultanés.

Avec `APP_NAME=demo-app` et `DOMAINE_NAME=xp.maifinno.fr`, les origines calculées sont :

- recette : `https://demo-app-re7.xp.maifinno.fr` ;
- production : `https://demo-app.xp.maifinno.fr`.

Après la première création de chaque app, configurer les domaines personnalisés, les enregistrements DNS et les certificats TLS correspondants. Le calcul de l'origine ne les crée pas. Tant que ce domaine n'est pas opérationnel, le FQDN Azure peut permettre de consulter les pages, mais les formulaires POST nécessitent l'origine HTTPS configurée pour leur protection CSRF.

Le groupe de ressources, l'environnement ACA cible et le serveur PostgreSQL sont les prérequis d'infrastructure ; l'app et sa base applicative ne sont pas des prérequis au premier déploiement. Le workflow résout seulement le FQDN du serveur avant la commande de création, sans lire une app inexistante ni exiger une base non encore créée. Les déploiements d'une même cible sont sérialisés pour éviter deux créations concurrentes.

### Première installation

1. Déployer l'image sur la cible souhaitée avec `az containerapp create`.
2. Le workflow récupère son identité système ou l'active si nécessaire, sans retirer les identités utilisateur. L'ajout d'une identité ne redémarre pas automatiquement ACA : le workflow redémarre la dernière révision uniquement après cette activation, puis publie le `principalId` dans le résumé GitHub Actions.
3. Préparer une fois l'identité OIDC du workflow comme administratrice Entra PostgreSQL du serveur, puis renseigner `POSTGRES_ENTRA_ADMIN_USERNAME` avec son nom exact de rôle SQL. Azure RBAC seul ne suffit pas.
4. Exécuter **Provision PostgreSQL** pour cette app : création ou vérification de son rôle Entra par jeton OIDC, puis création de sa base et attribution des droits via le compte PostgreSQL administrateur user/password.
5. Configurer le domaine HTTPS de l'app et vérifier le CRUD. L'onglet Database réessaie l'initialisation après les erreurs ; un nouveau déploiement n'est pas nécessaire uniquement pour ajouter les droits SQL.

Jusqu'à la préparation SQL, l'application démarre et les autres pages restent accessibles, mais l'onglet Database est indisponible. Le succès du déploiement ne signifie pas que PostgreSQL est prêt : le workflow ne crée ni rôle Entra, ni base, ni droits SQL et ne valide pas la connexion runtime. Répéter ce parcours séparément pour `demo-app-re7` et `demo-app`. Aucun appel Azure n'est exécuté automatiquement depuis le poste de développement.

### Provisionnement PostgreSQL manuel

Le workflow [provision-postgres.yml](.github/workflows/provision-postgres.yml), **Provision PostgreSQL**, est exécuté manuellement depuis `main`, séparément du déploiement. Ses entrées sont :

- `container_app_name` : nom exact d'une Container App existante dans `rg-glaude-xp-maifinno`, en texte libre ;
- `postgres_server` : liste déroulante contenant `pg-glaude-sdx`.

Créer et protéger l'environnement GitHub **postgres-provisioning** : approbateurs et branche `main` uniquement. Le workflow réutilise `azure/login@v3` et l'identité Azure du déploiement. Ajouter à cette identité un credential fédéré avec le sujet `repo:<owner>/<repo>:environment:postgres-provisioning` ; les sujets `recette` et `production` ne couvrent pas cet environnement. Ne pas lui donner accès aux exécutions de branches non approuvées.

Secrets de cet environnement :

- `GLAUDE_CLUSTER_UAI_LOGIN_CLIENT_ID` ;
- `GLAUDE_CLUSTER_UAI_LOGIN_TENANT_ID` ;
- `GLAUDE_CLUSTER_UAI_LOGIN_SUBSCRIPTION_ID` ;
- `POSTGRES_ADMIN_USERNAME` : compte administrateur PostgreSQL utilisé pour créer les bases et attribuer les droits ;
- `POSTGRES_ADMIN_PASSWORD` : son mot de passe, à protéger et renouveler selon votre politique.

Les secrets Azure peuvent aussi être définis au niveau dépôt s'ils sont autorisés pour ce workflow. Les deux secrets PostgreSQL sont exposés uniquement à l'étape de provisionnement, pas aux tests ni au build. Les anciens paramètres `POSTGRES_PROVISION_*` et `POSTGRES_PROVISIONER_USERNAME` ne sont plus utilisés.

Variables non secrètes de cet environnement :

- `POSTGRES_RESOURCE_GROUP` : resource group réel du Flexible Server ; ne pas supposer qu'il est identique à celui des apps ;
- `POSTGRES_ENTRA_ADMIN_USERNAME` : nom exact du rôle SQL administrateur Entra correspondant à l'identité OIDC déjà configurée sur ce serveur. Ce n'est ni le compte PostgreSQL classique, ni le nom de l'app.

Prérequis à préparer en infrastructure : authentifications **PostgreSQL par mot de passe et Entra** activées sur le Flexible Server. Le compte PostgreSQL doit pouvoir créer des bases et attribuer les droits sur ses objets. **Azure RBAC Contributor ne donne pas ces droits SQL.** L'identité OIDC lit le serveur et l'identité système des Container Apps, puis se connecte à la base `postgres` avec un jeton Entra pour gérer uniquement le rôle de l'app. Elle doit déjà être administratrice Entra PostgreSQL sur ce serveur. Le workflow ne configure ni administrateur Entra ni rôle Azure RBAC et n'usurpe pas l'identité de l'app.

Le runner doit joindre PostgreSQL sur TCP 5432 avec DNS et TLS vérifié. L'accès réseau depuis ACA est un prérequis distinct. Aucune règle de pare-feu n'est ouverte automatiquement ; pour un serveur privé, utiliser un runner connecté au réseau.

Le script lit l'identité **System Assigned** existante de `container_app_name` et récupère son `principalId` avant toute connexion SQL. Il ne l'active pas et ne modifie aucune identité utilisateur. Si l'app ou son identité système est absente, il s'arrête explicitement.

Le workflow maintient deux connexions distinctes :

- **Entra** : jeton OIDC obtenu pour `oss-rdbms`, utilisé comme mot de passe avec `POSTGRES_ENTRA_ADMIN_USERNAME` sur la base `postgres`. Après vérification de son statut administrateur Entra, cette connexion inspecte le rôle applicatif et, s'il manque, appelle `pgaadauth_create_principal_with_oid` avec le nom exact de l'app, son `principalId`, le type `service`, sans droits administrateur ni MFA interactif. Le rôle est revérifié après création.
- **PostgreSQL classique** : `POSTGRES_ADMIN_USERNAME` et `POSTGRES_ADMIN_PASSWORD`, utilisés exclusivement pour créer la base et appliquer les `GRANT` et privilèges par défaut. Aucune fonction `pgaadauth` n'est appelée sur cette connexion.

Les deux connexions utilisent TLS avec vérification du certificat et du nom d'hôte. Le jeton temporaire est masqué dans GitHub Actions et n'est jamais enregistré dans un secret, un output ou un artefact. Un jeton absent, un accès Entra refusé ou un conflit de rôle bloque la création de base et les `GRANT`. Un rôle existant lié à un autre Object ID n'est jamais remappé automatiquement. Le verrou SQL de session couvre la préparation Entra et les opérations sur la base ; les connexions sont fermées en cas d'échec. Un rôle déjà créé peut subsister si la suite échoue : la réexécution vérifie ce rôle et reprend sans le supprimer.

La base porte exactement le nom de l'app, tirets compris. Son propriétaire reste le compte administrateur PostgreSQL configuré, pas l'app. Une base déjà créée avec l'ancien provisionneur Entra aura potentiellement un autre propriétaire : faire préparer explicitement le changement de propriétaire et des objets par un administrateur avant de relancer, sans reprise automatique.

Les droits accordés sont `CONNECT` sur la base, `USAGE, CREATE` sur `public`, CRUD sur les tables et `USAGE, SELECT` sur les séquences créées par le rôle de provisionnement. Ses privilèges par défaut couvrent ses futures créations. L'app possède les objets qu'elle crée elle-même : ces droits dépassent donc la lecture/écriture stricte. Les objets existants appartenant à un troisième rôle nécessitent une attribution manuelle ; les privilèges par défaut d'autres rôles de migration ne sont pas modifiés.

Les réexécutions réutilisent une base et un rôle compatibles, sans suppression. Un autre propriétaire de base, un rôle administrateur, une identité Entra différente ou recréée provoquent un arrêt explicite. Les exécutions sont sérialisées par serveur et par verrou SQL de session. Les droits hérités et ceux de `PUBLIC` ne sont pas révoqués : auditer les ACL du serveur pour une isolation stricte entre applications. Le workflow n'accorde pas explicitement de droits sur les autres bases.

Attention : ce provisionnement ne migre aucune donnée d'une ancienne base vers la nouvelle base au nom de l'app. Préparer cette migration séparément avant la bascule si des données sont à conserver.

### Connexion sans mot de passe

Le déploiement configure `DATABASE_AUTH=azure-managed-identity`, `PGHOST` depuis le FQDN Azure du serveur, `PGPORT=5432` et `PGDATABASE`/`PGUSER` au nom exact de l'app. `ORIGIN` conserve son calcul HTTPS habituel.

Le pool `pg` utilise `ManagedIdentityCredential` sans client ID pour sélectionner l'identité système ACA. Son fournisseur de mot de passe obtient un jeton pour `https://ossrdbms-aad.database.windows.net/.default` lors de chaque nouvelle connexion physique ; le SDK gère son cache et son renouvellement. Les connexions SQL déjà authentifiées n'ont pas besoin d'être recréées à chaque expiration de jeton. Le certificat et le nom d'hôte TLS sont vérifiés.

Seul le provisionnement utilise un mot de passe PostgreSQL stocké dans un secret GitHub. Ce secret n'est jamais fourni à l'application, au build ou à ACA. L'application n'a besoin d'aucun mot de passe PostgreSQL ni de Key Vault ; ses jetons temporaires ne sont pas persistés. L'identité runtime n'est pas l'identité OIDC du workflow.

Pour lancer l'application depuis le poste du développeur, effectuer `az login --tenant <tenant-id>` puis configurer le fichier `.env` local :

```dotenv
DATABASE_AUTH=azure-cli
PGHOST=pg-glaude-sdx.postgres.database.azure.com
PGPORT=5432
PGDATABASE=demo-app-re7
PGUSER=developpeur@example.com
```

Utiliser le FQDN réel du serveur et le nom exact du rôle Entra du développeur ou de son groupe. Le mode `azure-cli` sélectionne explicitement `AzureCliCredential` et renouvelle les jetons pour les nouvelles connexions, comme le mode ACA. Ne pas utiliser le rôle de l'app comme utilisateur du développeur : lire son Object ID ne permet pas de s'authentifier sous cette identité depuis le poste.

L'administrateur Entra doit enregistrer l'utilisateur ou le groupe développeur s'il n'existe pas. Un administrateur SQL doit lui accorder les droits nécessaires sur la base, le schéma, les tables et les séquences, y compris les objets créés par l'app. Les privilèges par défaut dépendent de chaque rôle créateur. Ce workflow n'invente pas d'identité développeur et ne modifie pas ses droits existants. Réseau et TLS restent nécessaires depuis le poste.

Pour un outil SQL, utiliser l'authentification Entra de l'extension PostgreSQL, ou `psql` après `az login` avec un jeton éphémère :

```sh
PGSSLMODE=verify-full PGSSLROOTCERT=/chemin/ca.pem \
PGPASSWORD="$(az account get-access-token --resource-type oss-rdbms --query accessToken --output tsv)" \
psql --host=pg-glaude-sdx.postgres.database.azure.com --port=5432 \
	--dbname=demo-app-re7 --username=developpeur@example.com
```

Remplacer le chemin CA, l'hôte et le rôle par les valeurs réelles ; ne jamais afficher ni enregistrer le jeton dans `.env`, un secret GitHub ou l'historique. En local, sans `DATABASE_AUTH`, `DATABASE_URL` reste utilisable pour un PostgreSQL classique. Un mode inconnu ou une configuration Azure incomplète ne déclenchent pas de repli silencieux vers cette URL.

L'ancien secret ACA `database-url` n'est pas supprimé. Pour un retour arrière vers une image utilisant une URL, rétablir explicitement `DATABASE_URL=secretref:database-url` et retirer `DATABASE_AUTH` ; le workflow de déploiement actuel réactive sinon le mode Entra. Ne supprimer les anciens secrets qu'après validation de la bascule et de la stratégie de retour arrière.

Vérifications locales : `npm run test:provision`, `npm run test:database`, `npm run check` et `npm run lint`. Les tests de configuration simulent le fournisseur de jetons ; ils ne prouvent pas l'accès Entra réel ni le renouvellement SDK dans ACA. Les tests CRUD PostgreSQL nécessitent `TEST_DATABASE_URL` vers une base isolée. Le test SQL de provisionnement s'active avec `TEST_PROVISION_DATABASE_URL` vers une instance de test exclusivement : il crée puis supprime sa propre base et son rôle uniques, et nécessite `CREATEDB, CREATEROLE`. Seules les fonctions Entra y sont simulées, les contrôles et grants sont exécutés sur PostgreSQL. Après provisionnement, exécuter à nouveau le workflow, déployer, tester le CRUD et une nouvelle connexion après expiration/renouvellement du jeton dans ACA.

### Permissions de déploiement

Permissions GitHub requises sur le workflow :

- `contents: read`
- `packages: read`
- `id-token: write`

Prérequis Azure pour la connexion OIDC :

- une inscription d'application Azure correspondant au `client-id`
- des informations d'identification fédérées configurées pour ce dépôt GitHub
- des droits suffisants sur la resource group `rg-glaude-xp-maifinno`
- une connexion GitHub Actions via `azure/login@v3`

Configuration appliquée par le déploiement :

- ingress externe
- `targetPort=3000`
- image source `ghcr.io/<owner>/<repo>:<tag>`
- resource group cible `rg-glaude-xp-maifinno`
- environnement ACA `aca-glaude-xp-maifinno`

Déclenchement manuel :

- cible `recette` ou `production`
- tag d'image libre, par exemple `latest`, `main` ou un tag SHA publié par le workflow Docker

## Séquence CI/CD

1. Un push sur `main` déclenche [docker-image.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/docker-image.yml).
2. L'image est publiée dans GHCR.
3. Le succès de ce workflow déclenche [deploy-aca.yml](/Users/71220K/workspaces/github.com/maif/stanislas-draunet-maif/demo-node-app/.github/workflows/deploy-aca.yml).
4. L'image portant le tag SHA du commit construit est déployée automatiquement sur l'application ACA de recette.
5. Un déploiement manuel peut ensuite cibler la production avec le tag voulu.
