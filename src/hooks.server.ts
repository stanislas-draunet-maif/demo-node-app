import { building } from '$app/environment';
import { initializeDatabase, DatabaseUnavailable } from '$lib/server/db';
import type { ServerInit } from '@sveltejs/kit';

export const init: ServerInit = async () => {
	if (building) return;
	try {
		await initializeDatabase();
	} catch (error) {
		if (!(error instanceof DatabaseUnavailable)) throw error;
	}
};
