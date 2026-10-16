import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Pool } from 'pg';

async function startApp(context, databaseUrl = '', databaseEnvironment = {}) {
	const reservation = createServer();
	reservation.listen(0, '127.0.0.1');
	await once(reservation, 'listening');
	const port = reservation.address().port;
	await new Promise((resolve) => reservation.close(resolve));
	const origin = `http://127.0.0.1:${port}`;
	const child = spawn(process.execPath, ['build'], {
		cwd: fileURLToPath(new URL('../', import.meta.url)),
		env: {
			...process.env,
			DATABASE_AUTH: '',
			DATABASE_URL: databaseUrl,
			...databaseEnvironment,
			ORIGIN: origin,
			HOST: '127.0.0.1',
			PORT: String(port)
		},
		stdio: ['ignore', 'pipe', 'pipe']
	});
	context.after(async () => {
		if (child.exitCode !== null) return;
		const closed = once(child, 'exit');
		const force = setTimeout(() => child.kill('SIGKILL'), 5000);
		child.kill('SIGTERM');
		await closed;
		clearTimeout(force);
	});
	await new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error('Délai de démarrage du serveur dépassé')),
			20000
		);
		child.once('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once('exit', () => {
			clearTimeout(timeout);
			reject(new Error("Le serveur s'est arrêté avant la fin du démarrage"));
		});
		let output = '';
		child.stdout.on('data', (chunk) => {
			output += chunk.toString();
			if (output.includes('Listening on')) {
				clearTimeout(timeout);
				resolve();
			}
		});
	});
	return {
		async get(path = '/database') {
			return fetch(`${origin}${path}`);
		},
		async post(action, fields, query = '') {
			return fetch(`${origin}/database?/${action}${query}`, {
				method: 'POST',
				headers: { Origin: origin, Accept: 'text/html' },
				body: new URLSearchParams(fields)
			});
		}
	};
}

test(
	'Application disponible sans configuration PostgreSQL',
	{ timeout: 30000 },
	async (context) => {
		const app = await startApp(context);
		assert.equal((await app.get('/')).status, 200);
		const page = await app.get();
		assert.equal(page.status, 200);
		assert.match(await page.text(), /DATABASE_URL/);
		assert.match(await (await app.get()).text(), /n'est pas configurée/);
		const invalid = await app.post('add', { information: '   ' });
		assert.equal(invalid.status, 400);
		assert.match(await invalid.text(), /1 à 1000 caractères/);
		const unavailable = await app.post('add', { information: 'Test' });
		assert.equal(unavailable.status, 503);
		assert.match(await unavailable.text(), /DATABASE_URL/);
	}
);

test(
	'Configuration Entra incomplete : application disponible et mutations refusees',
	{ timeout: 30000 },
	async (context) => {
		const app = await startApp(context, '', {
			DATABASE_AUTH: 'azure-managed-identity',
			PGHOST: '',
			PGDATABASE: '',
			PGUSER: ''
		});
		assert.equal((await app.get('/')).status, 200);
		assert.match(await (await app.get()).text(), /PGHOST, PGDATABASE, PGUSER/);
		assert.equal((await app.post('add', { information: 'Test' })).status, 503);
	}
);

test(
	'PostgreSQL : initialisation, CRUD et validation HTTP sans JavaScript',
	{ skip: !process.env.TEST_DATABASE_URL, timeout: 60000 },
	async (context) => {
		const databaseUrl = process.env.TEST_DATABASE_URL;
		const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
		const marker = `integration-${randomUUID()}`;
		context.after(async () => {
			try {
				await pool.query('DELETE FROM public.informations WHERE information LIKE $1', [
					`${marker}%`
				]);
			} finally {
				await pool.end();
			}
		});
		const [app, secondApp] = await Promise.all([
			startApp(context, databaseUrl),
			startApp(context, databaseUrl)
		]);
		const table = await pool.query("SELECT to_regclass('public.informations') AS name");
		assert.equal(table.rows[0].name, 'informations');
		assert.equal((await secondApp.get('/')).status, 200);

		await context.test('ajout paramétré et lecture persistante', async () => {
			const information = `${marker} '; DROP TABLE informations; --`;
			const result = await app.post('add', { information });
			assert.equal(result.status, 200);
			const rows = await pool.query(
				'SELECT id, information FROM public.informations WHERE information = $1',
				[information]
			);
			assert.equal(rows.rowCount, 1);
			assert.equal(rows.rows[0].information, information);
			assert.match(await (await secondApp.get()).text(), new RegExp(marker));
		});
		const rows = await pool.query('SELECT id FROM public.informations WHERE information LIKE $1', [
			`${marker}%`
		]);
		const id = String(rows.rows[0].id);

		await context.test(
			'validation et conservation de la modification sans JavaScript',
			async () => {
				assert.equal((await app.post('add', { information: ' ' })).status, 400);
				assert.equal((await app.post('add', { information: 'x'.repeat(1001) })).status, 400);
				for (const invalidId of ['-1', '0', '1.5', '2147483648', '1 OR 1=1']) {
					assert.equal(
						(await app.post('update', { id: invalidId, information: marker })).status,
						400
					);
				}
				const invalid = await app.post('update', { id, information: ' ' }, `&edit=${id}`);
				assert.equal(invalid.status, 400);
				assert.match(await invalid.text(), /textarea/);
			}
		);

		await context.test('modification, relecture et confirmation de suppression', async () => {
			const information = `${marker} modifié`;
			const result = await app.post('update', { id, information }, `&edit=${id}`);
			assert.equal(result.status, 200);
			assert.equal(new URL(result.url).searchParams.has('edit'), false);
			const updated = await pool.query(
				'SELECT information FROM public.informations WHERE id = $1',
				[id]
			);
			assert.equal(updated.rows[0].information, information);
			assert.match(await (await secondApp.get()).text(), new RegExp(information));
			assert.equal((await app.post('delete', { id })).status, 400);
			const confirm = await app.post('confirmDelete', { id });
			assert.equal(confirm.status, 200);
			assert.match(await confirm.text(), /Confirmer/);
			assert.equal(
				(await pool.query('SELECT id FROM public.informations WHERE id = $1', [id])).rowCount,
				1
			);
			assert.equal((await app.post('delete', { id, confirmed: 'yes' })).status, 200);
			assert.equal(
				(await pool.query('SELECT id FROM public.informations WHERE id = $1', [id])).rowCount,
				0
			);
			assert.equal((await app.post('update', { id, information })).status, 404);
			assert.equal((await app.post('delete', { id, confirmed: 'yes' })).status, 404);
		});
	}
);
