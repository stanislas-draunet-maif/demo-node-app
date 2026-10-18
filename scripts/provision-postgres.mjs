import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

const execute = promisify(execFile);

class ProvisioningError extends Error {}

export function createDiagnostics(log = console.log) {
	const secrets = new Set();
	const clean = (value) => {
		let message = String(value);
		for (const secret of secrets) message = message.replaceAll(secret, '[masque]');
		return (
			message
				.replace(/Bearer\s+\S+/gi, 'Bearer [masque]')
				.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[masque]')
				.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[masque]@')
				// eslint-disable-next-line no-control-regex -- External values must not inject CI log lines.
				.replace(/[\u0000-\u001f\u007f]/g, ' ')
				.replaceAll('::', ': :')
		);
	};
	const describe = (error) => {
		if (error instanceof AggregateError) return error.errors.map(describe).join('; ');
		const fields = [error instanceof Error ? error.message : String(error)];
		for (const key of ['code', 'detail', 'hint', 'stderr']) {
			if (error?.[key]) fields.push(`${key}=${error[key]}`);
		}
		if (error?.cause) fields.push(describe(error.cause));
		return clean(fields.join('; '));
	};
	return {
		clean,
		describe,
		addSecret(secret) {
			if (secret) secrets.add(secret);
		},
		info(message) {
			log(`[PostgreSQL] ${clean(message)}`);
		},
		async step(label, action) {
			log(`[PostgreSQL] Debut : ${clean(label)}`);
			try {
				const result = await action();
				log(`[PostgreSQL] OK : ${clean(label)}`);
				return result;
			} catch (error) {
				throw new ProvisioningError(`${clean(label)} : ${describe(error)}`);
			}
		}
	};
}

async function withCleanup(action, cleanup, label) {
	let result;
	const failures = [];
	try {
		result = await action();
	} catch (error) {
		failures.push(error);
	}
	try {
		await cleanup();
	} catch (error) {
		failures.push(new ProvisioningError(label, { cause: error }));
	}
	if (failures.length > 1) throw new AggregateError(failures);
	if (failures.length) throw failures[0];
	return result;
}

export async function verifyEntraAdministrator(admin, username, diagnostics) {
	const { rows: sessions } = await admin.query(
		'SELECT current_user AS current_user, session_user AS session_user'
	);
	const session = sessions[0];
	if (!session?.current_user || !session.session_user) {
		throw new ProvisioningError('Utilisateur SQL effectif introuvable.');
	}
	diagnostics.info(
		`Compte configure=${username}; current_user=${session.current_user}; session_user=${session.session_user}`
	);
	const { rows } = await admin.query('SELECT * FROM pg_catalog.pgaadauth_list_principals(true)');
	if (rows.some((entry) => entry.rolename === username)) return;
	const metadata = (entry) => ({
		rolename: entry.rolename,
		objectId: entry.objectid ?? entry.objectId,
		principalType: entry.principaltype ?? entry.principalType,
		isAdmin: entry.isadmin ?? entry.isAdmin
	});
	diagnostics.info(`Administrateurs Entra retournes : ${JSON.stringify(rows.map(metadata))}`);
	const { rows: principals } = await admin.query(
		'SELECT * FROM pg_catalog.pgaadauth_list_principals(false)'
	);
	const relevant = principals.filter((entry) =>
		[username, session.current_user, session.session_user].includes(entry.rolename)
	);
	diagnostics.info(
		`Principaux du compte configure/effectif : ${JSON.stringify(relevant.map(metadata))}`
	);
	const reason = !rows.length
		? 'La liste des administrateurs Entra est vide.'
		: rows.some((entry) => entry.rolename?.toLowerCase() === username.toLowerCase())
			? 'Un administrateur porte ce nom avec une casse differente.'
			: 'Le nom configure ne correspond exactement a aucun administrateur Entra retourne.';
	throw new ProvisioningError(
		`L'identite OIDC doit deja etre administratrice Entra PostgreSQL. ${reason} ` +
			`Compte configure="${username}", current_user="${session.current_user}", session_user="${session.session_user}". ` +
			'Comparer le rolename exact (casse comprise) et l Object ID de l UAI avec les administrateurs du serveur cible. ' +
			'Verifier POSTGRES_ENTRA_ADMIN_USERNAME et la configuration Entra du serveur ; Azure RBAC seul ne suffit pas.'
	);
}

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

export async function ensureEntraRole(entra, app, principalId, diagnostics = createDiagnostics()) {
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
		diagnostics.info(`Creation du role Entra "${app}" pour principalId=${principalId}`);
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
	diagnostics.info(`Role Entra "${app}" ${roleCreated ? 'cree' : 'existant'} et verifie`);
	return roleCreated;
}

export async function provisionDatabase(
	admin,
	connectDatabase,
	app,
	principalId,
	diagnostics = createDiagnostics()
) {
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(principalId)) {
		throw new ProvisioningError('principalId ACA invalide.');
	}
	const name = identifier(app);
	await diagnostics.step('Acquisition du verrou de provisionnement', () =>
		admin.query('SELECT pg_advisory_lock(174208361, 2)')
	);
	return withCleanup(
		async () => {
			const { rows: databases } = await admin.query(
				'SELECT pg_get_userbyid(datdba) = current_user AS owned FROM pg_database WHERE datname = $1',
				[app]
			);
			if (databases.length && !databases[0].owned) {
				throw new ProvisioningError('La base existante appartient a un autre proprietaire.');
			}
			const roleCreated = await diagnostics.step(`Verification/preparation du role "${app}"`, () =>
				ensureEntraRole(admin, app, principalId, diagnostics)
			);
			if (!databases.length) {
				await diagnostics.step(`Creation de la base "${app}"`, () =>
					admin.query(`CREATE DATABASE ${name}`)
				);
			} else {
				diagnostics.info(`Base "${app}" existante, proprietaire compatible`);
			}
			const database = await connectDatabase(app);
			await withCleanup(
				() =>
					diagnostics.step(`Attribution des droits sur "${app}"`, async () => {
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
					}),
				() => database.end(),
				'Fermeture de la connexion applicative impossible'
			);
			return { databaseCreated: !databases.length, roleCreated };
		},
		() =>
			diagnostics.step('Liberation du verrou de provisionnement', () =>
				admin.query('SELECT pg_advisory_unlock(174208361, 2)')
			),
		'Liberation du verrou impossible'
	);
}

async function azure(...args) {
	let stdout;
	try {
		({ stdout } = await execute('az', [...args, '--only-show-errors', '--output', 'json'], {
			timeout: 120000,
			maxBuffer: 1024 * 1024
		}));
	} catch (error) {
		// execFile's message can include stdout, including the access token.
		throw Object.assign(
			new ProvisioningError(
				`Echec Azure CLI (${args.slice(0, 3).join(' ')}). Verifiez droits et configuration Azure.`
			),
			{ code: error.code, stderr: error.stderr }
		);
	}
	try {
		return JSON.parse(stdout);
	} catch {
		throw new ProvisioningError(
			`Reponse JSON Azure CLI invalide (${args.slice(0, 3).join(' ')}). Sortie non affichee.`
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
	ClientType = Client,
	diagnostics = createDiagnostics()
) {
	const app = environment.CONTAINER_APP_NAME;
	const server = environment.POSTGRES_SERVER;
	await diagnostics.step('Validation de la configuration', async () => {
		validateSettings(app, server);
		for (const key of ['ACA_RESOURCE_GROUP', 'POSTGRES_RESOURCE_GROUP']) {
			if (!environment[key]?.trim())
				throw new ProvisioningError(`Configuration manquante : ${key}`);
		}
		if (!environment.POSTGRES_ENTRA_ADMIN_USERNAME?.trim()) {
			throw new ProvisioningError('Configuration manquante : POSTGRES_ENTRA_ADMIN_USERNAME');
		}
	});
	const principalId = await diagnostics.step(`Lecture de l identite systeme ACA "${app}"`, () =>
		readSystemIdentity(request, app, environment.ACA_RESOURCE_GROUP)
	);
	diagnostics.info(`Identite runtime : app=${app}; principalId=${principalId}`);
	const settings = await diagnostics.step(`Lecture du serveur PostgreSQL "${server}"`, async () => {
		const settings = await request(
			'postgres',
			'flexible-server',
			'show',
			'--name',
			server,
			'--resource-group',
			environment.POSTGRES_RESOURCE_GROUP
		);
		if (settings.authConfig?.activeDirectoryAuth !== 'Enabled') {
			throw new ProvisioningError("Activer l'authentification Entra sur le serveur PostgreSQL.");
		}
		if (!settings.fullyQualifiedDomainName) {
			throw new ProvisioningError('FQDN PostgreSQL manquant.');
		}
		return settings;
	});
	diagnostics.info(
		`Cible SQL : serveur=${settings.fullyQualifiedDomainName}; base=${app}; compte=${environment.POSTGRES_ENTRA_ADMIN_USERNAME}`
	);
	const token = await diagnostics.step('Acquisition du jeton Entra PostgreSQL', async () => {
		const token = await request('account', 'get-access-token', '--resource-type', 'oss-rdbms');
		if (!token.accessToken) throw new ProvisioningError('Jeton PostgreSQL Entra manquant.');
		diagnostics.addSecret(token.accessToken);
		return token;
	});
	if (environment.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${token.accessToken}`);
	const connect = (database) =>
		diagnostics.step(
			`Connexion PostgreSQL a "${database}" (compte "${environment.POSTGRES_ENTRA_ADMIN_USERNAME}", serveur "${settings.fullyQualifiedDomainName}")`,
			async () => {
				const client = new ClientType({
					host: settings.fullyQualifiedDomainName,
					port: 5432,
					database,
					user: environment.POSTGRES_ENTRA_ADMIN_USERNAME,
					password: token.accessToken,
					ssl: { rejectUnauthorized: true },
					connectionTimeoutMillis: 10000,
					statement_timeout: 120000,
					query_timeout: 130000
				});
				try {
					await client.connect();
					return client;
				} catch (error) {
					const sanitize = diagnostics.clean;
					const safeMessage = diagnostics.describe(error);
					let cleanup = '';
					try {
						await client.end();
					} catch (cleanupError) {
						const safeCleanupMessage = diagnostics.describe(cleanupError);
						cleanup = `; fermeture de connexion : ${safeCleanupMessage}`;
					}
					throw new ProvisioningError(
						`Connexion PostgreSQL impossible (administrateur Entra (jeton Azure), compte "${sanitize(environment.POSTGRES_ENTRA_ADMIN_USERNAME)}", base "${sanitize(database)}", serveur "${sanitize(settings.fullyQualifiedDomainName)}"): ${safeMessage}${cleanup}`
					);
				}
			}
		);
	const admin = await connect('postgres');
	return withCleanup(
		async () => {
			await diagnostics.step('Controle administrateur Entra PostgreSQL', () =>
				verifyEntraAdministrator(admin, environment.POSTGRES_ENTRA_ADMIN_USERNAME, diagnostics)
			);
			const result = await diagnostics.step(`Provisionnement de "${app}"`, () =>
				provisionDatabase(admin, connect, app, principalId, diagnostics)
			);
			diagnostics.info(
				`Provisionnement termine : baseCreee=${result.databaseCreated}; roleCree=${result.roleCreated}`
			);
			return { app, server, principalId, ...result };
		},
		() => admin.end(),
		'Fermeture de la connexion administrateur impossible'
	);
}

async function main() {
	const diagnostics = createDiagnostics();
	try {
		const result = await runProvisioning(process.env, azure, Client, diagnostics);
		console.log(JSON.stringify(result));
		if (process.env.GITHUB_STEP_SUMMARY) {
			await appendFile(
				process.env.GITHUB_STEP_SUMMARY,
				`### PostgreSQL\n\nApp / base / role : \`${result.app}\`\n\nServeur : \`${result.server}\`\n\nIdentite systeme : \`${result.principalId}\`\n\nBase creee : ${result.databaseCreated}. Role Entra cree : ${result.roleCreated}.\n`
			);
		}
	} catch (error) {
		console.error(`Provisionnement interrompu : ${diagnostics.describe(error)}`);
		process.exitCode = 1;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await main();
}
