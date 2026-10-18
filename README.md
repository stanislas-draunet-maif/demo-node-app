# demo-node-app

Application SvelteKit de démonstration, inspirée de la structure et des codes couleur des autres applications Svelte MAIF de l'espace de travail.

Version cible de Node.js : `24`

## Aperçu

- SvelteKit avec `@sveltejs/adapter-node`
- image Docker multi-stage basée sur `node:24-alpine`
- publication d'image dans GHCR via GitHub Actions
- déploiement vers Azure Container Apps via `azure/container-apps-deploy-action@v2`

Fichiers de référence :

- [package.json](package.json)
- [Dockerfile](Dockerfile)
- [docker-image.yml](.github/workflows/docker-image.yml)
- [deploy-aca.yml](.github/workflows/deploy-aca.yml)

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
DATABASE_URL=postgresql://utilisateur:mot_de_passe@localhost:5432/demo_app
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
TEST_DATABASE_URL='postgresql://utilisateur:mot_de_passe@localhost:5432/demo_test' npm run test:database
```

Ne pas inscrire de mot de passe ni d'autre identifiant secret dans ce fichier. Utiliser des variables d'environnement locales ou les secrets adaptés à l'environnement.

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

L'image est construite depuis [Dockerfile](Dockerfile) en trois étapes :

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

Le workflow [docker-image.yml](.github/workflows/docker-image.yml) construit l'image Docker et la pousse vers GHCR.

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

Le workflow [deploy-aca.yml](.github/workflows/deploy-aca.yml) déploie une image déjà publiée dans GHCR via `azure/container-apps-deploy-action@v2`. Le workflow actif passe les paramètres de création ou de mise à jour directement à l'action, avec `environmentVariables` pour définir `DATABASE_AUTH`, `PGHOST`, `PGPORT`, `PGDATABASE` et `PGUSER`. Il ne génère pas de fichier `yamlConfigPath` et ne définit pas `ORIGIN`. Les blocs de workflow commentés dans ce fichier ne décrivent pas le déploiement exécuté.

Comportement :

- après un build Docker réussi depuis `main`, déploiement automatique en `recette` avec le tag SHA du commit construit
- déploiement manuel possible via `workflow_dispatch` vers `recette` ou `production`
- l'image déployée est `ghcr.io/<owner>/<repo>:<tag>`
- pour un lancement manuel, `latest` est remplacé par le tag `sha-<7 caractères>` du commit courant du workflow ; les autres tags sont utilisés tels quels

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

Configuration PostgreSQL et origine publique :

- le workflow fixe `POSTGRES_SERVER=pg-glaude-sdx` et `POSTGRES_RESOURCE_GROUP=rg-glaude-database-sdx` ; une variable GitHub de même nom ne remplace pas ces valeurs ;
- vérifier `POSTGRES_ENTRA_ADMIN_USERNAME`, actuellement fixé à `aca-glaude-xp-maifinnorg-glaude-xp-maifinnoOidc` dans l'étape de provisionnement du déploiement ; cette valeur doit être le nom exact du rôle PostgreSQL Entra correspondant à l'UAI utilisée par `azure/login`. Une variable GitHub de même nom ne remplace pas cette valeur. Cette UAI doit être administratrice Entra sur le Flexible Server ; ne pas utiliser le compte d'un utilisateur humain avec son jeton ;
- le déploiement configure `PGHOST` comme `<POSTGRES_SERVER>.postgres.database.azure.com`, `PGPORT=5432` et `PGDATABASE`/`PGUSER` avec le nom de l'app cible ;
- autoriser les connexions depuis ACA vers PostgreSQL : DNS, réseau, pare-feu, TLS et droits SQL ;
- dimensionner PostgreSQL pour un pool de 5 connexions maximum par processus et tenir compte des réplicas et révisions simultanés.

Le workflow définit `DOMAINE_NAME`, mais ne l'utilise pas et ne calcule pas d'`ORIGIN`. Or les formulaires POST derrière un reverse proxy nécessitent l'origine publique HTTPS exacte pour la protection CSRF. Avant d'utiliser ces formulaires dans ACA, adapter le workflow actif pour transmettre `ORIGIN` correspondant au domaine HTTPS configuré et vérifier les DNS et certificats. Les noms d'application et de domaine ne sont pas configurés automatiquement ensemble.

Le groupe de ressources ACA, l'environnement ACA et le serveur PostgreSQL sont des prérequis d'infrastructure. Le workflow de déploiement ne résout pas ces ressources avant l'action et ne sérialise pas les déploiements concurrents d'une même cible.

### Première installation

1. Préparer une fois l'identité OIDC du workflow comme administratrice Entra PostgreSQL du serveur avec la [procédure UAI ci-dessous](#donner-les-droits-administrateur-entra-postgresql-a-une-uai), puis vérifier que le nom du rôle SQL configuré dans l'étape `Provision database and system identity access` est exact. Azure RBAC seul ne suffit pas.
2. Déployer l'image sur la cible souhaitée. À la première exécution, le workflow crée l'app si nécessaire, lui active l'identité système si elle manque, valide les paramètres et les tests de provisionnement, puis crée ou vérifie le rôle Entra, la base et les droits SQL avec le jeton de l'UAI du workflow.
3. Le workflow déploie ensuite l'image avec les variables runtime PostgreSQL. Vérifier le CRUD après avoir configuré `ORIGIN` dans le workflow actif pour le domaine HTTPS public.
4. Répéter pour `demo-app-re7` et `demo-app`.

La préparation SQL intégrée ne s'exécute que si l'app n'a pas d'identité système. Si elle échoue après l'activation de cette identité, ou si la base doit être reprovisionnée ultérieurement, exécuter **Provision PostgreSQL** séparément. Le succès du déploiement ne valide pas la connexion runtime à PostgreSQL. Aucun appel Azure n'est exécuté automatiquement depuis le poste de développement.

### Donner les droits administrateur Entra PostgreSQL a une UAI

Cette préparation s'effectue une fois par UAI et par serveur, hors du workflow. Elle donne des droits d'administration PostgreSQL sur **tout le serveur**, pas seulement sur une base. Utiliser l'UAI de provisionnement, jamais l'identité système runtime de la Container App. L'ajout ne supprime pas les administrateurs existants.

Prérequis : Azure CLI avec la commande `az postgres flexible-server microsoft-entra-admin`, une UAI existante, l'authentification Entra activée sur le serveur et un compte Azure autorisé à lire l'UAI et à écrire les administrateurs du serveur (`Microsoft.DBforPostgreSQL/flexibleServers/administrators/write`). Être administrateur SQL ou disposer d'un rôle Azure de lecture ne suffit pas pour cet ajout. Les requêtes SQL nécessitent aussi `psql`, un accès réseau au serveur sur TCP 5432 et un compte déjà administrateur Entra PostgreSQL.

#### 1. Choisir le tenant, la souscription et les ressources

Exécuter les blocs Bash suivants dans le même terminal. Remplacer les paramètres entre chevrons avant exécution ; adapter le nom et le groupe de ressources pour une autre UAI.

```bash
az login --tenant "<TENANT_ID>"
az account set --subscription "<SUBSCRIPTION_ID_DU_SERVEUR>"
az account show \
  --query '{subscription:name,subscriptionId:id,tenantId:tenantId}' \
  --output yaml

POSTGRES_SERVER="pg-glaude-sdx"
POSTGRES_RESOURCE_GROUP="rg-glaude-database-sdx"
UAI_NAME="aca-glaude-xp-maifinnorg-glaude-xp-maifinnoOidc"
UAI_RESOURCE_GROUP="<RESOURCE_GROUP_DE_L_UAI>"
UAI_SUBSCRIPTION_ID="<SUBSCRIPTION_ID_DE_L_UAI>"
```

Si le groupe de ressources de l'UAI est inconnu, lister les identités visibles dans sa souscription :

```bash
az identity list \
  --subscription "$UAI_SUBSCRIPTION_ID" \
  --query "[].{name:name,resourceGroup:resourceGroup,clientId:clientId,principalId:principalId}" \
  --output table
```

Une liste vide ne prouve pas l'absence d'identité : vérifier la souscription, le tenant et les droits de lecture. Une application Entra avec un credential OIDC n'est pas nécessairement une ressource UAI.

#### 2. Recuperer les identifiants sans les recopier

```bash
UAI_CLIENT_ID=$(az identity show \
  --subscription "$UAI_SUBSCRIPTION_ID" \
  --resource-group "$UAI_RESOURCE_GROUP" \
  --name "$UAI_NAME" --query clientId --output tsv) || exit 1

UAI_OBJECT_ID=$(az identity show \
  --subscription "$UAI_SUBSCRIPTION_ID" \
  --resource-group "$UAI_RESOURCE_GROUP" \
  --name "$UAI_NAME" --query principalId --output tsv) || exit 1

if [[ -z "$UAI_CLIENT_ID" || ! "$UAI_OBJECT_ID" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]; then
  echo "Client ID absent ou Object ID invalide : arret avant attribution des droits." >&2
  exit 1
fi

printf 'Client ID : %s\nObject ID : %s\n' "$UAI_CLIENT_ID" "$UAI_OBJECT_ID"
```

`clientId` identifie l'application pour `azure/login` ; `principalId` est l'Object ID du service principal à autoriser dans PostgreSQL. Ne pas les intervertir. Un GUID contient des groupes de 8-4-4-4-12 caractères.

Pour vérifier une identité à partir du Client ID utilisé par le workflow, cette commande alternative nécessite des droits de lecture Microsoft Graph :

```bash
az ad sp show --id "$UAI_CLIENT_ID" \
  --query '{name:displayName,objectId:id,clientId:appId,type:servicePrincipalType}' \
  --output yaml
```

Une UAI est de type `ManagedIdentity` ; `Application` désigne un service principal applicatif, pas une UAI. L'identifiant à autoriser est alors toujours l'`id` du service principal, jamais l'Object ID de l'inscription d'application. Ne pas poursuivre avec une identité différente de celle attendue.

#### 3. Verifier le serveur et ajouter l'administrateur

```bash
az postgres flexible-server show \
  --resource-group "$POSTGRES_RESOURCE_GROUP" --name "$POSTGRES_SERVER" \
  --query '{host:fullyQualifiedDomainName,authentication:authConfig}' --output yaml

az postgres flexible-server microsoft-entra-admin list \
  --resource-group "$POSTGRES_RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" --output json
```

Vérifier `activeDirectoryAuth: Enabled`. Si Entra est désactivé, le faire activer dans le portail Azure, sur le serveur, rubrique **Authentication**, en conservant les autres modes d'authentification requis par les consommateurs existants.

Si l'Object ID de l'UAI n'est pas déjà présent, l'ajouter :

```bash
az postgres flexible-server microsoft-entra-admin create \
  --resource-group "$POSTGRES_RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" \
  --display-name "$UAI_NAME" \
  --object-id "$UAI_OBJECT_ID" \
  --type ServicePrincipal

az postgres flexible-server microsoft-entra-admin list \
  --resource-group "$POSTGRES_RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" --output json
```

Une identité managée est représentée par un service principal Entra, d'où `--type ServicePrincipal`. Comparer l'Object ID retourné avec `UAI_OBJECT_ID`, pas uniquement les noms affichés.

#### 4. Verifier le role dans PostgreSQL

La vérification Azure et la vérification SQL sont complémentaires. Depuis le même terminal, utiliser le compte humain administrateur Entra choisi lors de `az login`, pas le nom de l'UAI avec un jeton humain :

```bash
PGHOST=$(az postgres flexible-server show \
  --resource-group "$POSTGRES_RESOURCE_GROUP" --name "$POSTGRES_SERVER" \
  --query fullyQualifiedDomainName --output tsv) || exit 1
ENTRA_ADMIN_USERNAME="<ROLE_SQL_DU_COMPTE_HUMAIN_ADMIN_ENTRA>"
PGSSLROOTCERT="<CHEMIN_DU_CERTIFICAT_RACINE_DE_CONFIANCE_PEM>"

(
  set -e
  export PGHOST PGSSLROOTCERT
  export PGSSLMODE=verify-full
  export PGPORT=5432
  export PGDATABASE=postgres
  export PGUSER="$ENTRA_ADMIN_USERNAME"
  PGPASSWORD=$(az account get-access-token \
    --resource-type oss-rdbms --query accessToken --output tsv)
  export PGPASSWORD
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --pset=pager=off \
    --command='SELECT * FROM pg_catalog.pgaadauth_list_principals(true);' \
    --command='SELECT * FROM pg_catalog.pgaadauth_list_principals(false);'
)
```

Utiliser le certificat racine fourni ou recommandé par l'infrastructure, sans désactiver la vérification TLS. Ne pas activer `set -x`, afficher le jeton ou le sauvegarder dans un fichier. Le sous-shell limite `PGPASSWORD` à cette vérification. Pour un serveur privé, le poste ou le runner doit être connecté au réseau ; Cloud Shell n'y a pas automatiquement accès.

Retrouver l'UAI par son `objectId`, vérifier `principalType = service` et `isAdmin = 1`, puis relever le `rolename` exact, y compris sa casse. `true` liste uniquement les administrateurs ; `false` liste toutes les identités Entra. Si l'UAI est absente ou non administratrice, ne pas contourner le contrôle du script : vérifier l'Object ID, le serveur et le résultat de l'opération Azure.

#### 5. Aligner GitHub Actions et valider avec l'UAI

- Configurer `GLAUDE_CLUSTER_UAI_LOGIN_CLIENT_ID` avec `UAI_CLIENT_ID`, ainsi que les secrets de tenant et de souscription appropriés. Pour une nouvelle UAI, préparer ses credentials fédérés pour les environnements GitHub utilisés (`recette`, `production`, `postgres-provisioning`) et ses droits Azure de lecture/déploiement nécessaires ; l'ajout comme administrateur PostgreSQL ne les crée pas.
- Dans [provision-postgres.yml](.github/workflows/provision-postgres.yml), définir la variable `POSTGRES_ENTRA_ADMIN_USERNAME` de l'environnement `postgres-provisioning` avec le `rolename` relevé.
- Dans [deploy-aca.yml](.github/workflows/deploy-aca.yml), mettre à jour la valeur de `POSTGRES_ENTRA_ADMIN_USERNAME` de l'étape **Provision database and system identity access** : elle est actuellement écrite directement dans le workflow. Une variable GitHub ne remplace pas cette valeur littérale.
- Relancer **Provision PostgreSQL** pour confirmer la connexion réelle de l'UAI et son statut administrateur. Le jeton obtenu par `azure/login` doit appartenir à la même identité que le rôle SQL. Aucun mot de passe PostgreSQL permanent n'est nécessaire.

Changer d'UAI ne transfère pas la propriété des bases et des objets existants : le script refuse une base appartenant à un autre rôle. Préparer explicitement ce transfert avec un administrateur si nécessaire ; ne pas supprimer les données pour contourner ce contrôle.

Erreurs courantes :

- `ad-admin is misspelled or not recognized` : utiliser `microsoft-entra-admin`, le nom actuel, et vérifier `az version` / `az postgres flexible-server --help` ; mettre à jour Azure CLI si cette commande manque aussi.
- `InvalidResourceIdSegment` / GUID invalide : utiliser le `principalId` complet, récupéré automatiquement, pas le Client ID ni un identifiant tronqué.
- `AuthorizationFailed` lors de l'ajout : le compte Azure exécutant la commande n'a pas les droits de gestion des administrateurs ; faire intervenir l'équipe infrastructure.
- Jeton incompatible avec un rôle utilisateur humain : ne pas présenter un jeton UAI avec un nom de connexion humain, ou inversement.
- `L'identite OIDC doit deja etre administratrice Entra PostgreSQL.` : la connexion a réussi, mais le contrôle SQL ne retrouve pas le nom configuré dans la liste des administrateurs ; comparer `rolename`, Object ID et `isAdmin`.

Références : [commandes Azure CLI des administrateurs Entra](https://learn.microsoft.com/en-us/cli/azure/postgres/flexible-server/microsoft-entra-admin) et [gestion des rôles Entra PostgreSQL](https://learn.microsoft.com/en-us/azure/postgresql/security/security-manage-entra-users).

### Provisionnement PostgreSQL manuel

Le workflow [provision-postgres.yml](.github/workflows/provision-postgres.yml), **Provision PostgreSQL**, est exécuté manuellement depuis `main`, séparément du déploiement. Ses entrées sont :

- `container_app_name` : nom exact d'une Container App existante dans `rg-glaude-xp-maifinno`, en texte libre ;
- `postgres_server` : liste déroulante contenant `pg-glaude-sdx`.

Créer et protéger l'environnement GitHub **postgres-provisioning** : approbateurs et branche `main` uniquement. Le workflow réutilise `azure/login@v3` et l'identité Azure du déploiement. Ajouter à cette identité un credential fédéré avec le sujet `repo:<owner>/<repo>:environment:postgres-provisioning` ; les sujets `recette` et `production` ne couvrent pas cet environnement. Ne pas lui donner accès aux exécutions de branches non approuvées.

Secrets de cet environnement :

- `GLAUDE_CLUSTER_UAI_LOGIN_CLIENT_ID` ;
- `GLAUDE_CLUSTER_UAI_LOGIN_TENANT_ID` ;
- `GLAUDE_CLUSTER_UAI_LOGIN_SUBSCRIPTION_ID`.

Les secrets Azure peuvent aussi être définis au niveau dépôt s'ils sont autorisés pour ce workflow. `POSTGRES_ADMIN_USERNAME` et `POSTGRES_ADMIN_PASSWORD` ne sont plus utilisés et peuvent être retirés de GitHub s'aucun autre workflow n'en dépend. Les anciens paramètres `POSTGRES_PROVISION_*` et `POSTGRES_PROVISIONER_USERNAME` ne sont plus utilisés.

Variable GitHub non secrète à définir dans l'environnement **postgres-provisioning** :

- `POSTGRES_ENTRA_ADMIN_USERNAME` : nom exact du rôle SQL administrateur Entra correspondant à l'identité OIDC déjà configurée sur ce serveur. Ce n'est ni le compte PostgreSQL classique, ni le nom de l'app.

Les groupes de ressources ne sont pas lus depuis les variables GitHub : `POSTGRES_RESOURCE_GROUP=rg-glaude-database-sdx` et `ACA_RESOURCE_GROUP=rg-glaude-xp-maifinno` sont fixés dans le bloc `env` du job de [provision-postgres.yml](.github/workflows/provision-postgres.yml). Modifier ce workflow pour utiliser d'autres groupes. Le workflow de déploiement fixe également ses valeurs, dont le nom du rôle UAI ; sa configuration est distincte de celle du workflow manuel.

Prérequis à préparer en infrastructure : authentification **Entra** activée sur le Flexible Server. L'authentification par mot de passe n'est plus nécessaire pour le provisionnement ; le workflow ne modifie pas ce réglage du serveur. **Azure RBAC Contributor ne donne pas les droits SQL.** L'UAI OIDC lit le serveur et l'identité système des Container Apps, puis se connecte à PostgreSQL avec un jeton Entra pour gérer le rôle applicatif, créer la base et attribuer les droits. Elle doit déjà être administratrice Entra PostgreSQL sur ce serveur. Le workflow ne configure ni administrateur Entra ni rôle Azure RBAC et n'usurpe pas l'identité de l'app.

Le runner doit joindre PostgreSQL sur TCP 5432 avec DNS et TLS vérifié. L'accès réseau depuis ACA est un prérequis distinct. Aucune règle de pare-feu n'est ouverte automatiquement ; pour un serveur privé, utiliser un runner connecté au réseau.

Le script lit l'identité **System Assigned** existante de `container_app_name` et récupère son `principalId` avant toute connexion SQL. Il ne l'active pas et ne modifie aucune identité utilisateur. Si l'app ou son identité système est absente, il s'arrête explicitement.

Le workflow utilise uniquement l'UAI de `azure/login` pour le provisionnement :

- Un jeton Entra obtenu pour `oss-rdbms` est utilisé comme mot de passe avec `POSTGRES_ENTRA_ADMIN_USERNAME` sur la base `postgres`. Après vérification de son statut administrateur Entra, cette connexion inspecte le rôle applicatif et, s'il manque, appelle `pgaadauth_create_principal_with_oid` avec le nom exact de l'app, son `principalId`, le type `service`, sans droits administrateur ni MFA interactif. Le rôle est revérifié après création, puis la base est créée avec la même connexion.
- Une connexion à la base applicative avec la même UAI et le même jeton applique les `GRANT` et privilèges par défaut.

Les deux connexions utilisent TLS avec vérification du certificat et du nom d'hôte. Le jeton temporaire est masqué dans GitHub Actions et n'est jamais enregistré dans un secret, un output ou un artefact. Un jeton absent, un accès Entra refusé ou un conflit de rôle bloque la création de base et les `GRANT`. Un rôle existant lié à un autre Object ID n'est jamais remappé automatiquement. Le verrou SQL de session couvre la préparation Entra et les opérations sur la base ; les connexions sont fermées en cas d'échec. Un rôle déjà créé peut subsister si la suite échoue : la réexécution vérifie ce rôle et reprend sans le supprimer.

La base porte exactement le nom de l'app, tirets compris. Son propriétaire est l'UAI administratrice Entra configurée, pas l'app. Une base déjà créée par un autre compte, notamment `adminDF`, provoque un arrêt : faire préparer explicitement le changement de propriétaire et des objets par un administrateur avant de relancer, sans reprise automatique ni suppression.

Les droits accordés sont `CONNECT` sur la base, `USAGE, CREATE` sur `public`, CRUD sur les tables et `USAGE, SELECT` sur les séquences créées par le rôle de provisionnement. Ses privilèges par défaut couvrent ses futures créations. L'app possède les objets qu'elle crée elle-même : ces droits dépassent donc la lecture/écriture stricte. Les objets existants appartenant à un troisième rôle nécessitent une attribution manuelle ; les privilèges par défaut d'autres rôles de migration ne sont pas modifiés.

Les réexécutions réutilisent une base et un rôle compatibles, sans suppression. Un autre propriétaire de base, un rôle administrateur, une identité Entra différente ou recréée provoquent un arrêt explicite. Les exécutions sont sérialisées par serveur et par verrou SQL de session. Les droits hérités et ceux de `PUBLIC` ne sont pas révoqués : auditer les ACL du serveur pour une isolation stricte entre applications. Le workflow n'accorde pas explicitement de droits sur les autres bases.

Attention : ce provisionnement ne migre aucune donnée d'une ancienne base vers la nouvelle base au nom de l'app. Préparer cette migration séparément avant la bascule si des données sont à conserver.

### Connexion sans mot de passe

Le déploiement configure `DATABASE_AUTH=azure-managed-identity`, `PGHOST` depuis le nom du serveur Azure, `PGPORT=5432` et `PGDATABASE`/`PGUSER` au nom exact de l'app. Le workflow actif ne configure pas `ORIGIN` : l'ajouter au déploiement avec l'origine HTTPS publique avant d'utiliser les formulaires derrière un reverse proxy.

Le pool `pg` utilise `ManagedIdentityCredential` sans client ID pour sélectionner l'identité système ACA. Son fournisseur de mot de passe obtient un jeton pour `https://ossrdbms-aad.database.windows.net/.default` lors de chaque nouvelle connexion physique ; le SDK gère son cache et son renouvellement. Les connexions SQL déjà authentifiées n'ont pas besoin d'être recréées à chaque expiration de jeton. Le certificat et le nom d'hôte TLS sont vérifiés.

Ni le provisionnement ni l'application dans ACA n'utilisent de mot de passe PostgreSQL permanent ou de Key Vault ; leurs jetons temporaires ne sont pas persistés. L'identité runtime est l'identité système de la Container App, distincte de l'UAI OIDC administratrice utilisée par le workflow.

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
- tag d'image libre publié dans GHCR ; `latest` sélectionne le tag SHA du commit courant du workflow, et non le tag littéral `latest`

## Séquence CI/CD

1. Un push sur `main` déclenche [docker-image.yml](.github/workflows/docker-image.yml).
2. L'image est publiée dans GHCR.
3. Le succès de ce workflow déclenche [deploy-aca.yml](.github/workflows/deploy-aca.yml).
4. L'image portant le tag SHA du commit construit est déployée automatiquement sur l'application ACA de recette.
5. Un déploiement manuel peut ensuite cibler la production avec le tag voulu.
