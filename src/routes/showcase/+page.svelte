<script lang="ts">
	const blocks = [
		{
			title: 'Hero orientee service',
			text: 'Une ouverture editoriale forte, avec appel a l action principal et cartes de contexte.'
		},
		{
			title: 'Cartes de confiance',
			text: 'Des panneaux surfaces coherents, avec ombre douce, bords arrondis et teintes claires.'
		},
		{
			title: 'Navigation segmentee',
			text: 'Le header reprend la logique des autres apps: logo, titre, menu et etat actif visible.'
		}
	];
</script>

<svelte:head>
	<title>Showcase | Demo Svelte MAIF</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 md:py-12">
	<div class="surface-card p-8 md:p-10">
		<p class="eyebrow">Showcase</p>
		<h2 class="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">Les briques de la demo</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-slate-600">
			Cette page expose les patterns visuels retenus pour disposer d une base saine et reutilisable sur vos prochaines demos Svelte.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		{#each blocks as block}
			<article class="surface-card p-6">
				<div class="h-1 w-16 rounded-full bg-[var(--maif-red)]"></div>
				<h3 class="mt-5 text-2xl font-bold text-slate-950">{block.title}</h3>
				<p class="mt-3 text-sm leading-7 text-slate-600">{block.text}</p>
			</article>
		{/each}
	</div>
</section>