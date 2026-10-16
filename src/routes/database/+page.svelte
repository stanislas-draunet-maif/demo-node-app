<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const editId = $derived(data.editId);
	const notice = $derived(form ? form.message : data.notice);
	const submit: SubmitFunction = ({ cancel }) => {
		if (busy) {
			cancel();
			return;
		}
		busy = true;
		return async ({ update }) => {
			try {
				await update();
			} finally {
				busy = false;
			}
		};
	};
</script>

<svelte:head>
	<title>Database | Démo Svelte MAIF</title>
	<meta name="description" content="Informations enregistrées dans PostgreSQL." />
</svelte:head>

<section class="mx-auto w-full max-w-7xl px-6 py-10" aria-busy={busy}>
	<div class="mb-8 flex flex-wrap items-center justify-between gap-4">
		<h2 class="text-3xl font-bold">Database</h2>
		<span class="flex items-center gap-2 text-sm text-slate-600">
			<span
				class="h-2.5 w-2.5 rounded-full"
				class:bg-emerald-600={data.connected}
				class:bg-red-600={!data.connected}
			></span>
			PostgreSQL : {data.connected ? 'connecté' : 'indisponible'}
		</span>
	</div>

	{#if data.databaseError}
		<div
			role="alert"
			class="mb-6 flex flex-wrap items-center gap-4 border-l-4 border-red-600 bg-red-50 p-4"
		>
			<p class="min-w-0 flex-1">{data.databaseError}</p>
			<a href={resolve('/database')} class="btn rounded-lg btn-sm">Réessayer</a>
		</div>
	{/if}

	{#if notice}
		<p
			role={!form || form.success ? 'status' : 'alert'}
			class="mb-6 border-l-4 p-4"
			class:border-emerald-600={!form || form.success}
			class:bg-emerald-50={!form || form.success}
			class:border-red-600={form && !form.success}
			class:bg-red-50={form && !form.success}
		>
			{notice}
		</p>
	{/if}

	<form method="POST" action="?/add" use:enhance={submit} class="mb-10">
		<fieldset disabled={!data.connected || busy} class="flex min-w-0 flex-wrap items-end gap-3">
			<div class="min-w-0 flex-1 basis-64">
				<label for="information" class="mb-2 block text-sm font-semibold">Information</label>
				<input
					id="information"
					name="information"
					type="text"
					required
					maxlength="1000"
					value={form?.operation === 'add' && !form.success ? form.information : ''}
					class="input w-full rounded-lg border-slate-300 bg-white"
				/>
			</div>
			<button
				type="submit"
				class="btn rounded-lg border-0 bg-[var(--maif-red)] text-white hover:bg-[var(--maif-red-deep)] disabled:bg-slate-200"
			>
				Ajouter
			</button>
		</fieldset>
	</form>

	<div class="mb-4 flex items-baseline justify-between gap-4">
		<h3 class="text-xl font-semibold">Informations</h3>
		{#if data.connected}
			<span class="text-sm text-slate-600"
				>{data.informations.length} enregistrement{data.informations.length > 1 ? 's' : ''}</span
			>
		{/if}
	</div>
	<div class="overflow-x-auto border-y border-slate-200 bg-white/80">
		<table class="w-full table-fixed text-left text-sm">
			<caption class="sr-only">Contenu de la table informations</caption>
			<thead class="border-b border-slate-200 bg-slate-100/80">
				<tr>
					<th scope="col" class="w-12 px-3 py-4 sm:w-16">ID</th>
					<th scope="col" class="px-3 py-4">Information</th>
					<th scope="col" class="w-28 px-3 py-4 sm:w-56">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each data.informations as item (item.id)}
					<tr class="border-b border-slate-100 align-top last:border-0">
						<td class="px-3 py-4 text-slate-500">{item.id}</td>
						<td class="px-3 py-4 [overflow-wrap:anywhere]">
							{#if editId === item.id}
								<form
									id="edit-{item.id}"
									method="POST"
									action="?/update&edit={item.id}"
									use:enhance={submit}
								>
									<input type="hidden" name="id" value={item.id} />
									<label for="edit-information-{item.id}" class="sr-only"
										>Modifier l'information {item.id}</label
									>
									<textarea
										id="edit-information-{item.id}"
										name="information"
										required
										maxlength="1000"
										rows="3"
										disabled={!data.connected || busy}
										class="textarea w-full min-w-0 rounded-lg border-slate-300"
										value={form?.operation === 'update' && form.id === item.id && !form.success
											? form.information
											: item.information}
									></textarea>
								</form>
							{:else}
								<span class="whitespace-pre-wrap">{item.information}</span>
							{/if}
						</td>
						<td class="px-3 py-4">
							{#if editId === item.id}
								<div class="flex flex-wrap gap-2">
									<button
										type="submit"
										form="edit-{item.id}"
										disabled={!data.connected || busy}
										class="btn rounded-lg btn-sm">Enregistrer</button
									>
									<a href={resolve('/database')} class="btn rounded-lg btn-ghost btn-sm">Annuler</a>
								</div>
							{:else if form?.confirmId === item.id}
								<form method="POST" action="?/delete" use:enhance={submit}>
									<input type="hidden" name="id" value={item.id} />
									<input type="hidden" name="confirmed" value="yes" />
									<p class="mb-2 font-medium">Supprimer cette information ?</p>
									<div class="flex flex-wrap gap-2">
										<button
											type="submit"
											disabled={!data.connected || busy}
											class="btn rounded-lg border-red-600 bg-red-600 text-white btn-sm"
											>Confirmer</button
										>
										<a href={resolve('/database')} class="btn rounded-lg btn-ghost btn-sm"
											>Annuler</a
										>
									</div>
								</form>
							{:else}
								<div class="flex flex-wrap gap-2">
									<a
										href="{resolve('/database')}?edit={item.id}#edit-{item.id}"
										class="btn rounded-lg btn-sm"
										aria-label="Modifier l'information {item.id}">Modifier</a
									>
									<form method="POST" action="?/confirmDelete" use:enhance={submit}>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											disabled={!data.connected || busy}
											class="btn rounded-lg btn-ghost text-red-700 btn-sm"
											aria-label="Supprimer l'information {item.id}">Supprimer</button
										>
									</form>
								</div>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="3" class="px-4 py-12 text-center text-slate-500">
							{data.connected
								? 'Aucune information enregistrée.'
								: 'Les informations ne sont pas disponibles.'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p role="status" class="mt-3 min-h-5 text-sm text-slate-600">
		{busy ? 'Enregistrement en cours...' : ''}
	</p>
</section>
