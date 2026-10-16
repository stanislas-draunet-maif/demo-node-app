import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createDatabaseConfig,
	databaseConfigurationError
} from '../src/lib/server/database-config.ts';

const azureEnvironment = {
	DATABASE_AUTH: 'azure-managed-identity',
	PGHOST: 'pg-glaude-sdx.postgres.database.azure.com',
	PGDATABASE: 'demo-app',
	PGUSER: 'demo-app'
};

test('mode local conserve DATABASE_URL sans creer de credential', () => {
	const environment = { DATABASE_URL: 'postgresql://localhost/demo' };
	assert.deepEqual(
		createDatabaseConfig(environment, () => {
			throw new Error('Azure inattendu');
		}),
		{
			connectionString: environment.DATABASE_URL
		}
	);
	assert.match(databaseConfigurationError({}), /DATABASE_URL/);
});

test('configuration Azure explicite, TLS et jetons sur les nouvelles authentifications', async () => {
	const scopes = [];
	let credentials = 0;
	const config = createDatabaseConfig({ ...azureEnvironment, DATABASE_URL: 'ignored' }, () => {
		credentials++;
		return {
			async getToken(scope) {
				scopes.push(scope);
				return { token: `token-${scopes.length}`, expiresOnTimestamp: Date.now() + 60000 };
			}
		};
	});
	assert.equal(credentials, 1);
	assert.equal(scopes.length, 0);
	assert.equal(config.connectionString, undefined);
	assert.equal(config.user, 'demo-app');
	assert.equal(config.database, 'demo-app');
	assert.equal(config.port, 5432);
	assert.deepEqual(config.ssl, { rejectUnauthorized: true });
	assert.equal(await config.password(), 'token-1');
	assert.equal(await config.password(), 'token-2');
	assert.deepEqual(scopes, Array(2).fill('https://ossrdbms-aad.database.windows.net/.default'));
});

test('mode developpeur Azure CLI explicite et independant de l identite ACA', async () => {
	const modes = [];
	for (const mode of ['azure-cli', 'azure-managed-identity']) {
		let calls = 0;
		const config = createDatabaseConfig(
			{
				...azureEnvironment,
				DATABASE_AUTH: mode,
				PGUSER: mode === 'azure-cli' ? 'developer@example.com' : 'demo-app'
			},
			(selected) => {
				modes.push(selected);
				return {
					async getToken(scope) {
						assert.equal(scope, 'https://ossrdbms-aad.database.windows.net/.default');
						calls++;
						if (mode === 'azure-cli' && calls === 1) throw new Error('az login required');
						return { token: `${mode}-${calls}`, expiresOnTimestamp: Date.now() + 60000 };
					}
				};
			}
		);
		assert.deepEqual(config.ssl, { rejectUnauthorized: true });
		if (mode === 'azure-cli') {
			assert.equal(config.user, 'developer@example.com');
			await assert.rejects(config.password(), /az login required/);
		}
		assert.equal(await config.password(), `${mode}-${calls}`);
	}
	assert.deepEqual(modes, ['azure-cli', 'azure-managed-identity']);
});

test('mode inconnu ou configuration incomplete refuse tout repli local', () => {
	for (const environment of [
		{ DATABASE_AUTH: 'unknown', DATABASE_URL: 'present' },
		{ ...azureEnvironment, PGHOST: '' },
		{ ...azureEnvironment, PGDATABASE: '' },
		{ ...azureEnvironment, PGUSER: '' },
		{ ...azureEnvironment, PGPORT: 'invalid' },
		{ ...azureEnvironment, DATABASE_AUTH: 'azure-cli', PGUSER: '' }
	])
		assert.throws(() => createDatabaseConfig(environment));
});

test('echec de jeton ne fige pas les authentifications suivantes', async () => {
	let calls = 0;
	const config = createDatabaseConfig(azureEnvironment, () => ({
		async getToken() {
			calls++;
			if (calls === 1) throw new Error('SDK unavailable');
			if (calls === 2) return null;
			return { token: 'recovered', expiresOnTimestamp: Date.now() + 60000 };
		}
	}));
	await assert.rejects(config.password(), /SDK unavailable/);
	await assert.rejects(config.password(), /Jeton PostgreSQL/);
	assert.equal(await config.password(), 'recovered');
});
