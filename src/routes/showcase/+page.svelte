<script lang="ts">
	const blocks = [
		{
			title: "Section d'accueil orientée service",
			text: "Une ouverture éditoriale forte, avec un appel à l'action principal et des cartes de contexte."
		},
		{
			title: 'Cartes de confiance',
			text: 'Des panneaux cohérents, avec une ombre douce, des bords arrondis et des teintes claires.'
		},
		{
			title: 'Navigation segmentée',
			text: "L'en-tête reprend la logique des autres applications : logo, titre, menu et état actif visible."
		}
	];
</script>

<svelte:head>
	<title>Showcase | Démo Svelte MAIF</title>
</svelte:head>

<section class="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 md:py-12">
	<div class="surface-card p-8 md:p-10">
		<p class="eyebrow">Showcase</p>
		<h2 class="mt-3 text-4xl font-extrabold tracking-tight text-slate-950">
			Les briques de la démo
		</h2>
		<p class="mt-4 max-w-3xl text-base leading-7 text-slate-600">
			Cette page expose les modèles visuels retenus pour disposer d'une base saine et réutilisable
			pour vos prochaines démos Svelte.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		{#each blocks as block (block.title)}
			<article class="surface-card p-6">
				<div class="h-1 w-16 rounded-full bg-[var(--maif-red)]"></div>
				<h3 class="mt-5 text-2xl font-bold text-slate-950">{block.title}</h3>
				<p class="mt-3 text-sm leading-7 text-slate-600">{block.text}</p>
			</article>
		{/each}
	</div>
</section>
