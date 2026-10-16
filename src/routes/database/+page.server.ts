import { fail, redirect, type Action } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
	addInformation,
	DatabaseUnavailable,
	deleteInformation,
	listInformations,
	updateInformation
} from '$lib/server/db';
import type { Actions, PageServerLoad } from './$types';

function parseId(value: FormDataEntryValue | string | null) {
	if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export const load: PageServerLoad = async ({ url }) => {
	try {
		return {
			informations: await listInformations(),
			connected: true,
			databaseError: null,
			notice: url.searchParams.get('updated') === '1' ? 'Information modifiée.' : null,
			editId: parseId(url.searchParams.get('edit'))
		};
	} catch (error) {
		if (!(error instanceof DatabaseUnavailable)) throw error;
		return { informations: [], connected: false, databaseError: error.message, editId: null };
	}
};

function mutation(operation: 'add' | 'update' | 'delete' | 'confirmDelete'): Action {
	return async ({ request }) => {
		const fields = await request.formData();
		const value = fields.get('information');
		const information = typeof value === 'string' ? value.trim() : '';
		const id = parseId(fields.get('id'));
		const response = {
			operation,
			information,
			id,
			confirmId: null as number | null,
			success: false,
			message: ''
		};

		if (operation !== 'add' && !id) {
			return fail(400, { ...response, message: 'Identifiant invalide.' });
		}
		if (operation === 'add' || operation === 'update') {
			if (!information || [...information].length > 1000) {
				return fail(400, {
					...response,
					information: information.slice(0, 2000),
					message: 'Saisissez une information de 1 à 1000 caractères.'
				});
			}
		}
		if (operation === 'confirmDelete') {
			return { ...response, confirmId: id };
		}
		if (operation === 'delete' && fields.get('confirmed') !== 'yes') {
			return fail(400, { ...response, message: 'Veuillez confirmer la suppression.' });
		}

		try {
			if (operation === 'add') {
				await addInformation(information);
			} else {
				const found =
					operation === 'update'
						? await updateInformation(id!, information)
						: await deleteInformation(id!);
				if (!found) {
					return fail(404, { ...response, message: "Cette information n'existe plus." });
				}
			}
			if (operation === 'update') redirect(303, `${resolve('/database')}?updated=1`);
			return {
				...response,
				success: true,
				message: operation === 'add' ? 'Information ajoutée.' : 'Information supprimée.'
			};
		} catch (error) {
			if (!(error instanceof DatabaseUnavailable)) throw error;
			return fail(503, { ...response, message: error.message });
		}
	};
}

export const actions = {
	add: mutation('add'),
	update: mutation('update'),
	delete: mutation('delete'),
	confirmDelete: mutation('confirmDelete')
} satisfies Actions;
