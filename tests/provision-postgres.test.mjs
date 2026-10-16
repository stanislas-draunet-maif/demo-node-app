import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Client } from 'pg';
import {
	readSystemIdentity,
	ensureEntraRole,
	runProvisioning,
	identifier,
	provisionDatabase,
	validateSettings
} from '../scripts/provision-postgres.mjs';

const principalId = '12345678-1234-1234-1234-123456789abc';

function fixture({
	role = true,
	mapping = true,
	owned,
	failGrant = false,
	objects = [],
	administrator = false,
	objectId = principalId
} = {}) {
	const queries = [];
	const admin = {
		async query(sql, values) {
			queries.push([sql, values]);
			if (sql.includes('pgaadauth_list_principals'))
				return {
					rows: mapping
						? [{ rolename: 'demo-app', objectid: objectId, principaltype: 'service', isadmin: 0 }]
						: []
				};
			if (sql.includes('FROM pg_roles'))
				return { rows: role ? [{ rolcanlogin: true, administrator }] : [] };
			if (sql.includes('FROM pg_database')) return { rows: owned === undefined ? [] : [{ owned }] };
			return { rows: [] };
		}
	};
	let closed = false;
	const database = {
		async query(sql) {
			queries.push([sql]);
			if (failGrant && sql.startsWith('GRANT')) throw new Error('grant failed');
			return { rows: sql.includes('FROM pg_class') ? objects : [] };
		},
		async end() {
			closed = true;
		}
	};
	return {
		admin,
		database,
		queries,
		get closed() {
			return closed;
		}
	};
}

test('validation des inputs et echappement SQL', () => {
	validateSettings('demo-app-re7', 'pg-glaude-sdx');
	for (const app of [
		'',
		'A',
		'demo_app',
		'a--b',
		'-app',
		'app-',
		'x'.repeat(33),
		"app'; DROP ROLE admin;"
	]) {
		assert.throws(() => validateSettings(app, 'pg-glaude-sdx'));
	}
	assert.throws(() => validateSettings('demo-app', 'autre-serveur'));
	assert.equal(identifier('demo-app'), '"demo-app"');
	assert.equal(identifier('a"b'), '"a""b"');
	assert.throws(() => identifier('x'.repeat(64)));
});

test('creation avec role Entra existant, droits limites et fermeture', async () => {
	const state = fixture();
	const result = await provisionDatabase(
		state.admin,
		async () => state.database,
		'demo-app',
		principalId
	);
	assert.deepEqual(result, { databaseCreated: true, roleCreated: false });
	assert.ok(!state.queries.some(([sql]) => sql.includes('create_principal')));
	assert.ok(state.queries.some(([sql]) => sql === 'CREATE DATABASE "demo-app"'));
	assert.ok(state.queries.some(([sql]) => sql.includes('GRANT USAGE, CREATE ON SCHEMA')));
	assert.ok(state.queries.some(([sql]) => sql.includes('ALTER DEFAULT PRIVILEGES')));
	assert.ok(!state.queries.some(([sql]) => /DROP |ALTER ROLE|OWNER TO|GRANT ALL/.test(sql)));
	assert.equal(state.closed, true);
	assert.match(state.queries.at(-1)[0], /pg_advisory_unlock/);
});

test('reexecution reutilise role et base compatibles', async () => {
	const state = fixture({ role: true, owned: true });
	assert.deepEqual(
		await provisionDatabase(state.admin, async () => state.database, 'demo-app', principalId),
		{ databaseCreated: false, roleCreated: false }
	);
	assert.ok(!state.queries.some(([sql]) => /CREATE DATABASE|create_principal_with_oid/.test(sql)));
});

test('conflits OID et proprietaire arretes avant mutation', async () => {
	for (const options of [
		{ role: true, mapping: false },
		{ role: true, objectId: 'other' },
		{ role: true, administrator: true },
		{ owned: false }
	]) {
		const state = fixture(options);
		await assert.rejects(
			provisionDatabase(state.admin, async () => state.database, 'demo-app', principalId)
		);
		assert.ok(
			!state.queries.some(([sql]) => /CREATE DATABASE|create_principal_with_oid|GRANT/.test(sql))
		);
		assert.match(state.queries.at(-1)[0], /pg_advisory_unlock/);
	}
});

test('echec SQL ferme la connexion et libere le verrou', async () => {
	const state = fixture({ failGrant: true });
	await assert.rejects(
		provisionDatabase(state.admin, async () => state.database, 'demo-app', principalId)
	);
	assert.equal(state.closed, true);
	assert.match(state.queries.at(-1)[0], /pg_advisory_unlock/);
});

test('objets existants : grants uniquement pour le createur administratif', async () => {
	const state = fixture({
		objects: [
			{ relname: 'existing-table', relkind: 'r', owned: true, owner: 'admin' },
			{ relname: 'existing-sequence', relkind: 'S', owned: true, owner: 'admin' },
			{ relname: 'app-table', relkind: 'r', owned: false, owner: 'demo-app' }
		]
	});
	await provisionDatabase(state.admin, async () => state.database, 'demo-app', principalId);
	assert.ok(state.queries.some(([sql]) => sql.includes('ON TABLE public."existing-table"')));
	assert.ok(state.queries.some(([sql]) => sql.includes('ON SEQUENCE public."existing-sequence"')));
	assert.ok(!state.queries.some(([sql]) => sql.includes('public."app-table"')));
	const conflict = fixture({ objects: [{ owner: 'other', owned: false }] });
	await assert.rejects(
		provisionDatabase(conflict.admin, async () => conflict.database, 'demo-app', principalId),
		/autre role/
	);
});

test('lecture identite systeme uniquement, y compris avec identites utilisateur', async () => {
	const requests = [];
	const userAssignedIdentities = { '/subscriptions/example/identities/existing': {} };
	const result = await readSystemIdentity(
		async (...args) => {
			requests.push(args);
			return {
				identity: { type: 'SystemAssigned, UserAssigned', principalId, userAssignedIdentities }
			};
		},
		'demo-app',
		'rg-apps'
	);
	assert.equal(result, principalId);
	assert.deepEqual(requests, [
		['containerapp', 'show', '--name', 'demo-app', '--resource-group', 'rg-apps']
	]);
	for (const identity of [
		undefined,
		{ type: 'UserAssigned', principalId },
		{ type: 'SystemAssigned' },
		{ type: 'SystemAssigned', principalId: 'invalid' }
	]) {
		await assert.rejects(
			readSystemIdentity(async () => ({ identity }), 'demo-app', 'rg-apps'),
			/System Assigned/
		);
	}
	await assert.rejects(
		readSystemIdentity(
			async () => {
				throw new Error('Access denied');
			},
			'demo-app',
			'rg-apps'
		),
		/Access denied/
	);
});

test('orchestration : role via Entra, base et GRANT par compte PostgreSQL', async () => {
	const state = fixture();
	const configurations = [];
	const environment = {
		CONTAINER_APP_NAME: 'demo-app',
		POSTGRES_SERVER: 'pg-glaude-sdx',
		ACA_RESOURCE_GROUP: 'rg-apps',
		POSTGRES_RESOURCE_GROUP: 'rg-db',
		POSTGRES_ADMIN_USERNAME: 'sql-admin',
		POSTGRES_ADMIN_PASSWORD: 'test-only-password',
		POSTGRES_ENTRA_ADMIN_USERNAME: 'entra-admin'
	};
	const requests = [];
	const request = async (...args) => {
		requests.push(args);
		if (args[0] === 'account') return { accessToken: 'test-only-token' };
		assert.equal(configurations.length, 0);
		if (args[0] === 'containerapp') return { identity: { type: 'SystemAssigned', principalId } };
		assert.deepEqual(args.slice(0, 3), ['postgres', 'flexible-server', 'show']);
		return {
			fullyQualifiedDomainName: 'example.postgres.database.azure.com',
			authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Enabled' }
		};
	};
	class FakeClient {
		constructor(config) {
			this.config = config;
			configurations.push(config);
		}
		async connect() {}
		async query(...args) {
			const [sql] = args;
			if (this.config.user === 'entra-admin') {
				assert.ok(!/CREATE DATABASE|GRANT|ALTER DEFAULT|advisory/.test(sql));
				if (sql.includes('pgaadauth_list_principals(true)'))
					return { rows: [{ rolename: 'entra-admin' }] };
				return state.admin.query(...args);
			}
			assert.ok(!/pgaadauth/.test(sql));
			return (this.config.database === 'postgres' ? state.admin : state.database).query(...args);
		}
		async end() {}
	}
	const result = await runProvisioning(environment, request, FakeClient);
	assert.equal(result.principalId, principalId);
	assert.deepEqual(
		configurations.map((config) => config.database),
		['postgres', 'postgres', 'demo-app']
	);
	for (const config of configurations) {
		assert.equal(
			config.password,
			config.user === 'entra-admin' ? 'test-only-token' : environment.POSTGRES_ADMIN_PASSWORD
		);
		assert.deepEqual(config.ssl, { rejectUnauthorized: true });
	}
	assert.equal(requests[0][0], 'containerapp');
	assert.deepEqual(
		configurations.map((config) => config.user),
		['sql-admin', 'entra-admin', 'sql-admin']
	);
	for (const key of [
		'POSTGRES_ADMIN_USERNAME',
		'POSTGRES_ADMIN_PASSWORD',
		'POSTGRES_ENTRA_ADMIN_USERNAME'
	]) {
		await assert.rejects(
			runProvisioning(
				{ ...environment, [key]: '' },
				async () => ({ identity: { type: 'SystemAssigned', principalId } }),
				FakeClient
			),
			new RegExp(key)
		);
	}
	let connections = 0;
	class RefusedClient {
		async connect() {
			connections++;
			throw new Error(environment.POSTGRES_ADMIN_PASSWORD);
		}
		async end() {}
	}
	await assert.rejects(
		runProvisioning(
			environment,
			async (...args) =>
				args[0] === 'containerapp'
					? { identity: { type: 'SystemAssigned', principalId } }
					: {
							fullyQualifiedDomainName: 'example',
							authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Enabled' }
						},
			RefusedClient
		),
		(error) => !error.message.includes(environment.POSTGRES_ADMIN_PASSWORD)
	);
	assert.equal(connections, 1);
});

test('creation Entra parametree, verification apres creation et reexecution', async () => {
	let exists = false;
	const queries = [];
	const entra = {
		async query(sql, values) {
			queries.push([sql, values]);
			if (sql.includes('create_principal_with_oid')) {
				assert.deepEqual(values, ['demo-app', principalId]);
				assert.match(sql, /'service', false, false/);
				exists = true;
				return { rows: [] };
			}
			if (sql.includes('list_principals'))
				return {
					rows: exists
						? [
								{
									rolename: 'demo-app',
									objectid: principalId,
									principaltype: 'service',
									isadmin: 0
								}
							]
						: []
				};
			return { rows: exists ? [{ rolcanlogin: true }] : [] };
		}
	};
	assert.equal(await ensureEntraRole(entra, 'demo-app', principalId), true);
	assert.equal(await ensureEntraRole(entra, 'demo-app', principalId), false);
	assert.equal(queries.filter(([sql]) => sql.includes('create_principal_with_oid')).length, 1);
});

test('echecs Entra : aucune creation de base ni GRANT, connexions fermees', async () => {
	for (const scenario of [
		'token-missing',
		'token-denied',
		'entra-login-denied',
		'not-admin',
		'role-creation-denied'
	]) {
		const clients = [];
		const queries = [];
		const environment = {
			CONTAINER_APP_NAME: 'demo-app',
			POSTGRES_SERVER: 'pg-glaude-sdx',
			ACA_RESOURCE_GROUP: 'rg-apps',
			POSTGRES_RESOURCE_GROUP: 'rg-db',
			POSTGRES_ADMIN_USERNAME: 'sql-admin',
			POSTGRES_ADMIN_PASSWORD: 'private-password',
			POSTGRES_ENTRA_ADMIN_USERNAME: 'entra-admin'
		};
		const request = async (...args) => {
			if (args[0] === 'containerapp') return { identity: { type: 'SystemAssigned', principalId } };
			if (args[0] === 'account') {
				if (scenario === 'token-denied') throw new Error('Azure access denied');
				return scenario === 'token-missing' ? {} : { accessToken: 'private-token' };
			}
			return {
				fullyQualifiedDomainName: 'example',
				authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Enabled' }
			};
		};
		class FakeClient {
			constructor(config) {
				this.config = config;
				this.closed = false;
				clients.push(this);
			}
			async connect() {
				if (scenario === 'entra-login-denied' && this.config.user === 'entra-admin')
					throw new Error('private-token');
			}
			async query(sql) {
				queries.push(sql);
				if (sql.includes('list_principals(true)'))
					return { rows: scenario === 'not-admin' ? [] : [{ rolename: 'entra-admin' }] };
				if (sql.includes('create_principal_with_oid')) throw new Error('Role creation denied');
				return { rows: [] };
			}
			async end() {
				this.closed = true;
			}
		}
		await assert.rejects(
			runProvisioning(environment, request, FakeClient),
			(error) =>
				!error.message.includes('private-password') && !error.message.includes('private-token')
		);
		assert.ok(clients.every((client) => client.closed));
		assert.ok(!queries.some((sql) => /CREATE DATABASE|GRANT|ALTER DEFAULT/.test(sql)));
	}
});

test(
	'PostgreSQL isole : droits reels, objets existants/futurs et reexecution',
	{
		skip: !process.env.TEST_PROVISION_DATABASE_URL,
		timeout: 30000
	},
	async (context) => {
		const app = `test-${randomUUID().slice(0, 8)}`;
		const password = randomUUID();
		const adminUrl = new URL(process.env.TEST_PROVISION_DATABASE_URL);
		adminUrl.pathname = '/postgres';
		const admin = new Client({ connectionString: adminUrl.href });
		await admin.connect();
		const entraSession = new Client({ connectionString: adminUrl.href });
		await entraSession.connect();
		let mapped = false;
		const connect = async (database, application = false) => {
			const url = new URL(adminUrl);
			url.pathname = `/${database}`;
			if (application) {
				url.username = app;
				url.password = password;
			}
			const client = new Client({ connectionString: url.href });
			await client.connect();
			return client;
		};
		context.after(async () => {
			try {
				await entraSession.end();
				await admin.query(`DROP DATABASE IF EXISTS ${identifier(app)} WITH (FORCE)`);
				await admin.query(`DROP ROLE IF EXISTS ${identifier(app)}`);
			} finally {
				await admin.end();
			}
		});
		const entraAdapter = {
			async query(sql, values) {
				if (sql.includes('pgaadauth_list_principals'))
					return {
						rows: mapped
							? [{ rolename: app, objectid: principalId, principaltype: 'service', isadmin: 0 }]
							: []
					};
				if (sql.includes('pgaadauth_create_principal_with_oid')) {
					const { rows } = await entraSession.query(
						"SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', $1::text, $2::text) AS sql",
						[app, password]
					);
					await entraSession.query(rows[0].sql);
					mapped = true;
					return { rows: [] };
				}
				assert.ok(!/CREATE DATABASE|GRANT|ALTER DEFAULT|advisory/.test(sql));
				return entraSession.query(sql, values);
			}
		};
		assert.deepEqual(await provisionDatabase(admin, connect, app, principalId, entraAdapter), {
			databaseCreated: true,
			roleCreated: true
		});
		const application = await connect(app, true);
		const owner = await connect(app);
		try {
			await application.query(
				'CREATE TABLE public.app_table (id integer GENERATED ALWAYS AS IDENTITY, value text)'
			);
			await application.query("INSERT INTO public.app_table(value) VALUES ('created')");
			await application.query("UPDATE public.app_table SET value = 'updated'");
			assert.equal(
				(await application.query('SELECT value FROM public.app_table')).rows[0].value,
				'updated'
			);
			await application.query('DELETE FROM public.app_table');
			await owner.query('CREATE TABLE public.future_table (id serial, value text)');
			await application.query("INSERT INTO public.future_table(value) VALUES ('future')");
			await owner.query('CREATE TABLE public.existing_table (id serial, value text)');
			await owner.query(
				`REVOKE ALL ON public.existing_table, public.existing_table_id_seq FROM ${identifier(app)}`
			);
			assert.deepEqual(await provisionDatabase(admin, connect, app, principalId, entraAdapter), {
				databaseCreated: false,
				roleCreated: false
			});
			await application.query("INSERT INTO public.existing_table(value) VALUES ('existing')");
			await assert.rejects(
				application.query(`CREATE DATABASE ${identifier(`${app}-forbidden`)}`),
				/permission denied/
			);
		} finally {
			await application.end();
			await owner.end();
		}
	}
);
