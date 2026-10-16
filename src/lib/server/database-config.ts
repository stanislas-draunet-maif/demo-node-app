import { AzureCliCredential, ManagedIdentityCredential } from '@azure/identity';
import type { PoolConfig } from 'pg';

type Environment = Record<string, string | undefined>;

export function databaseConfigurationError(environment: Environment): string | undefined {
	if (!environment.DATABASE_AUTH) {
		return environment.DATABASE_URL?.trim()
			? undefined
			: "La connexion PostgreSQL n'est pas configurée (DATABASE_URL).";
	}
	if (!['azure-managed-identity', 'azure-cli'].includes(environment.DATABASE_AUTH)) {
		return 'Le mode DATABASE_AUTH est invalide.';
	}
	if (
		!environment.PGHOST?.trim() ||
		!environment.PGDATABASE?.trim() ||
		!environment.PGUSER?.trim()
	) {
		return 'La connexion PostgreSQL Entra est incomplète (PGHOST, PGDATABASE, PGUSER).';
	}
	if (environment.PGPORT && environment.PGPORT !== '5432') {
		return 'Le port PostgreSQL Entra doit être 5432.';
	}
	return undefined;
}

export function createDatabaseConfig(
	environment: Environment,
	createCredential: (mode: string) => Pick<ManagedIdentityCredential, 'getToken'> = (mode) =>
		mode === 'azure-cli' ? new AzureCliCredential() : new ManagedIdentityCredential()
): PoolConfig {
	const error = databaseConfigurationError(environment);
	if (error) throw new Error(error);
	if (!environment.DATABASE_AUTH) return { connectionString: environment.DATABASE_URL };
	const credential = createCredential(environment.DATABASE_AUTH);
	return {
		host: environment.PGHOST,
		port: 5432,
		database: environment.PGDATABASE,
		user: environment.PGUSER,
		ssl: { rejectUnauthorized: true },
		password: async () => {
			const token = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
			if (!token?.token) throw new Error('Jeton PostgreSQL indisponible.');
			return token.token;
		}
	};
}
