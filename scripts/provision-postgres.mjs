import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

const execute = promisify(execFile);

class ProvisioningError extends Error {}

export function validateSettings(app, server) {
	if (!/^[a-z][a-z0-9-]{0,30}[a-z0-9]$/.test(app ?? '') || app.includes('--')) {
		throw new ProvisioningError(
			'Nom ACA invalide : 2 a 32 caracteres minuscules, chiffres ou tirets.'
		);
	}
	if (server !== 'pg-glaude-sdx') throw new ProvisioningError('Serveur PostgreSQL non autorise.');
}

export function identifier(value) {
	if (!value || Buffer.byteLength(value) > 63 || value.includes('\0')) {
		throw new ProvisioningError('Identifiant PostgreSQL invalide.');
	}
	return `"${value.replaceAll('"', '""')}"`;
}

export async function ensureEntraRole(entra, app, principalId) {
	const inspect = async () => {
		const { rows: principals } = await entra.query(
			'SELECT * FROM pg_catalog.pgaadauth_list_principals(false)'
		);
		const { rows: roles } = await entra.query(
			`SELECT *, EXISTS (
			 SELECT 1 FROM pg_roles AS inherited
			 WHERE inherited.rolname = 'azure_pg_admin'
			 AND pg_has_role(pg_roles.oid, inherited.oid, 'MEMBER')
			 ) AS administrator FROM pg_roles WHERE rolname = $1`,
			[app]
		);
		return { mapping: principals.find((entry) => entry.rolename === app), role: roles[0] };
	};
	let { mapping, role } = await inspect();
	const roleCreated = !role;
	if (roleCreated) {
		await entra.query(
			"SELECT * FROM pg_catalog.pgaadauth_create_principal_with_oid($1, $2, 'service', false, false)",
			[app, principalId]
		);
		({ mapping, role } = await inspect());
	}
	if (
		!role ||
		!mapping ||
		(mapping.objectid ?? mapping.objectId)?.toLowerCase() !== principalId.toLowerCase() ||
		(mapping.principaltype ?? mapping.principalType) !== 'service' ||
		Number(mapping.isadmin ?? mapping.isAdmin) !== 0 ||
		!role.rolcanlogin ||
		role.rolsuper ||
		role.rolcreatedb ||
		role.rolcreaterole ||
		role.rolreplication ||
		role.rolbypassrls ||
		role.administrator
	) {
		throw new ProvisioningError(
			'Le role SQL existant ne correspond pas a une identite applicative non administratrice.'
		);
	}
	return roleCreated;
}

export async function provisionDatabase(admin, connectDatabase, app, principalId, entra = admin) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(principalId)) {
		throw new ProvisioningError('principalId ACA invalide.');
	}
	const name = identifier(app);
	await admin.query('SELECT pg_advisory_lock(174208361, 2)');
	try {
		const { rows: databases } = await admin.query(
			'SELECT pg_get_userbyid(datdba) = current_user AS owned FROM pg_database WHERE datname = $1',
			[app]
		);
		if (databases.length && !databases[0].owned) {
			throw new ProvisioningError('La base existante appartient a un autre proprietaire.');
		}
		const roleCreated = await ensureEntraRole(entra, app, principalId);
		if (!databases.length) await admin.query(`CREATE DATABASE ${name}`);
		const database = await connectDatabase(app);
		try {
			await database.query('BEGIN');
			const { rows: objects } = await database.query(
				`SELECT relname, relkind, pg_get_userbyid(relowner) AS owner,
				 relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owned
				 FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace
				 WHERE nspname = 'public' AND relkind IN ('r', 'p', 'v', 'm', 'f', 'S')`
			);
			if (objects.some((object) => !object.owned && object.owner !== app)) {
				throw new ProvisioningError(
					'Un objet public appartient a un autre role : attribution manuelle requise.'
				);
			}
			await database.query(`GRANT CONNECT ON DATABASE ${name} TO ${name}`);
			await database.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${name}`);
			for (const object of objects.filter((entry) => entry.owned)) {
				const target = `public.${identifier(object.relname)}`;
				const privileges =
					object.relkind === 'S'
						? `USAGE, SELECT ON SEQUENCE ${target}`
						: `SELECT, INSERT, UPDATE, DELETE ON TABLE ${target}`;
				await database.query(`GRANT ${privileges} TO ${name}`);
			}
			await database.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${name}`
			);
			await database.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${name}`
			);
			await database.query('COMMIT');
		} finally {
			await database.end();
		}
		return { databaseCreated: !databases.length, roleCreated };
	} finally {
		await admin.query('SELECT pg_advisory_unlock(174208361, 2)');
	}
}

async function azure(...args) {
	try {
		const { stdout } = await execute('az', [...args, '--only-show-errors', '--output', 'json'], {
			timeout: 120000,
			maxBuffer: 1024 * 1024
		});
		return JSON.parse(stdout);
	} catch {
		throw new ProvisioningError(
			`Echec Azure CLI (${args.slice(0, 3).join(' ')}). Verifiez droits et configuration Azure.`
		);
	}
}

export async function readSystemIdentity(request, app, resourceGroup) {
	const container = await request(
		'containerapp',
		'show',
		'--name',
		app,
		'--resource-group',
		resourceGroup
	);
	const identity = container.identity;
	if (
		!identity?.type
			?.split(',')
			.map((value) => value.trim())
			.includes('SystemAssigned') ||
		!identity.principalId ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.principalId)
	) {
		throw new ProvisioningError(
			'Identite System Assigned absente ou invalide sur la Container App. Aucune identite creee.'
		);
	}
	return identity.principalId;
}

export async function runProvisioning(
	environment = process.env,
	request = azure,
	ClientType = Client
) {
	const app = environment.CONTAINER_APP_NAME;
	const server = environment.POSTGRES_SERVER;
	validateSettings(app, server);
	for (const key of ['ACA_RESOURCE_GROUP', 'POSTGRES_RESOURCE_GROUP']) {
		if (!environment[key]?.trim()) throw new ProvisioningError(`Configuration manquante : ${key}`);
	}
	const principalId = await readSystemIdentity(request, app, environment.ACA_RESOURCE_GROUP);
	for (const key of [
		'POSTGRES_ADMIN_USERNAME',
		'POSTGRES_ADMIN_PASSWORD',
		'POSTGRES_ENTRA_ADMIN_USERNAME'
	]) {
		if (!environment[key]) throw new ProvisioningError(`Configuration manquante : ${key}`);
	}
	const settings = await request(
		'postgres',
		'flexible-server',
		'show',
		'--name',
		server,
		'--resource-group',
		environment.POSTGRES_RESOURCE_GROUP
	);
	if (
		settings.authConfig?.activeDirectoryAuth !== 'Enabled' ||
		settings.authConfig?.passwordAuth !== 'Enabled'
	) {
		throw new ProvisioningError(
			'Activer les authentifications PostgreSQL par mot de passe et Entra sur le serveur.'
		);
	}
	if (!settings.fullyQualifiedDomainName) {
		throw new ProvisioningError('FQDN PostgreSQL manquant.');
	}
	const connect = async (
		database,
		credentials = {
			user: environment.POSTGRES_ADMIN_USERNAME,
			password: environment.POSTGRES_ADMIN_PASSWORD
		}
	) => {
		const client = new ClientType({
			host: settings.fullyQualifiedDomainName,
			port: 5432,
			database,
			user: credentials.user,
			password: credentials.password,
			ssl: { rejectUnauthorized: true },
			connectionTimeoutMillis: 10000,
			statement_timeout: 120000,
			query_timeout: 130000
		});
		try {
			await client.connect();
			return client;
		} catch {
			await client.end();
			throw new ProvisioningError(
				'Connexion PostgreSQL impossible : verifier compte SQL ou administrateur Entra, authentification, TLS et reseau.'
			);
		}
	};
	const admin = await connect('postgres');
	try {
		const token = await request('account', 'get-access-token', '--resource-type', 'oss-rdbms');
		if (!token.accessToken) throw new ProvisioningError('Jeton PostgreSQL Entra manquant.');
		if (environment.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${token.accessToken}`);
		const entra = await connect('postgres', {
			user: environment.POSTGRES_ENTRA_ADMIN_USERNAME,
			password: token.accessToken
		});
		try {
			const { rows } = await entra.query(
				'SELECT * FROM pg_catalog.pgaadauth_list_principals(true)'
			);
			if (!rows.some((entry) => entry.rolename === environment.POSTGRES_ENTRA_ADMIN_USERNAME)) {
				throw new ProvisioningError(
					"L'identite OIDC doit deja etre administratrice Entra PostgreSQL."
				);
			}
			const result = await provisionDatabase(admin, connect, app, principalId, entra);
			return { app, server, principalId, ...result };
		} finally {
			await entra.end();
		}
	} finally {
		await admin.end();
	}
}

async function main() {
	const result = await runProvisioning();
	console.log(JSON.stringify(result));
	if (process.env.GITHUB_STEP_SUMMARY) {
		await appendFile(
			process.env.GITHUB_STEP_SUMMARY,
			`### PostgreSQL\n\nApp / base / role : \`${result.app}\`\n\nServeur : \`${result.server}\`\n\nIdentite systeme : \`${result.principalId}\`\n\nBase creee : ${result.databaseCreated}. Role Entra cree : ${result.roleCreated}.\n`
		);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(
			error instanceof ProvisioningError
				? error.message
				: 'Provisionnement SQL interrompu : verifier conflits, droits Entra et reseau. Aucun secret affiche.'
		);
		process.exitCode = 1;
	});
}
