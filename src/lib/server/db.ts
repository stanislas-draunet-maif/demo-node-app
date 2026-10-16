import { env } from '$env/dynamic/private';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { createDatabaseConfig, databaseConfigurationError } from './database-config';

export type Information = { id: number; information: string };

export class DatabaseUnavailable extends Error {
	constructor() {
		super(
			databaseConfigurationError(env) ?? 'La base de données est indisponible. Veuillez réessayer.'
		);
	}
}

let pool: Pool | undefined;
let initialization: Promise<void> | undefined;

function reportDatabaseError() {
	console.error(
		'PostgreSQL : connexion ou opération impossible. Vérifiez la configuration et les droits.'
	);
}

function getPool() {
	if (databaseConfigurationError(env)) throw new DatabaseUnavailable();
	if (!pool) {
		pool = new Pool({
			...createDatabaseConfig(env),
			max: 5,
			connectionTimeoutMillis: 5000,
			idleTimeoutMillis: 30000,
			statement_timeout: 5000,
			query_timeout: 7000,
			idle_in_transaction_session_timeout: 10000
		});
		pool.on('error', () => {
			initialization = undefined;
			reportDatabaseError();
		});
	}
	return pool;
}

async function createTable() {
	let client: PoolClient | undefined;
	try {
		client = await getPool().connect();
		await client.query('SELECT 1');
		await client.query('BEGIN');
		await client.query("SET LOCAL lock_timeout = '5s'");
		await client.query('SELECT pg_advisory_xact_lock(174208361, 1)');
		await client.query(`
			CREATE TABLE IF NOT EXISTS public.informations (
				id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
				information text NOT NULL CHECK (
					char_length(btrim(information)) BETWEEN 1 AND 1000
				),
				created_at timestamptz NOT NULL DEFAULT now()
			)
		`);
		await client.query('COMMIT');
	} catch (error) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch {
				client.release(true);
				client = undefined;
			}
		}
		throw error;
	} finally {
		client?.release();
	}
}

export async function initializeDatabase() {
	if (!initialization) {
		initialization = createTable().catch(() => {
			initialization = undefined;
			reportDatabaseError();
			throw new DatabaseUnavailable();
		});
	}
	await initialization;
}

async function query<Row extends QueryResultRow>(sql: string, values: unknown[] = []) {
	await initializeDatabase();
	try {
		return await getPool().query<Row>(sql, values);
	} catch {
		initialization = undefined;
		reportDatabaseError();
		throw new DatabaseUnavailable();
	}
}

export async function listInformations() {
	const result = await query<Information>(
		'SELECT id, information FROM public.informations ORDER BY id DESC'
	);
	return result.rows;
}

export async function addInformation(information: string) {
	await query('INSERT INTO public.informations (information) VALUES ($1)', [information]);
}

export async function updateInformation(id: number, information: string) {
	const result = await query('UPDATE public.informations SET information = $1 WHERE id = $2', [
		information,
		id
	]);
	return result.rowCount === 1;
}

export async function deleteInformation(id: number) {
	const result = await query('DELETE FROM public.informations WHERE id = $1', [id]);
	return result.rowCount === 1;
}
