<script lang="ts">
	import { resolve } from '$app/paths';

	const metrics = [
		{ label: 'Parcours actifs', value: '12', detail: '+3 cette semaine' },
		{ label: 'Satisfaction pilote', value: '94%', detail: 'sur les démos internes' },
		{ label: 'Temps moyen', value: '2 min 18', detail: 'de bout en bout' }
	];

	const highlights = [
		{
			title: 'Demande habitation',
			description:
				'Un parcours clair pour simuler, comparer et lancer une souscription en quelques étapes.',
			badge: 'Conversion'
		},
		{
			title: 'Sinistre auto',
			description:
				'Un suivi guidé avec pièces justificatives, statut en temps réel et points de contact immédiats.',
			badge: 'Assistance'
		},
		{
			title: 'Espace conseiller',
			description:
				'Une vision synthétique des actions prioritaires, des rappels clients et des indicateurs clés.',
			badge: 'Pilotage'
		}
	];

	const steps = [
		'Accueil éditorial qui met en avant le service principal',
		"Cartes d'indicateurs pour une lecture rapide des enjeux",
		"Blocs de parcours avec appels à l'action visibles",
		'Zone de confiance pour expliquer la valeur métier et la promesse'
	];
</script>

<svelte:head>
	<title>Démo APP MAIF</title>
	<meta name="description" content="Application Svelte de démonstration." />
</svelte:head>

<section class="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-8 md:py-12">
	<div class="hero-grid items-stretch">
		<div class="surface-card relative overflow-hidden p-8 md:p-10">
			<div class="absolute inset-x-0 top-0 h-1 bg-[var(--maif-red)]"></div>
			<div class="max-w-2xl space-y-6">
				<p class="eyebrow">Expérience de démonstration</p>
				<div class="space-y-4">
					<h2 class="text-4xl font-extrabold tracking-tight text-slate-950 md:text-6xl">
						Une application de démonstration.
					</h2>
					<p class="max-w-xl text-base leading-7 text-slate-600 md:text-lg">
						Cette démo reprend la structure des autres applications Svelte : une structure sobre, un
						en-tête affirmé, une navigation claire et une interface blanche, rouge et gris ardoise.
					</p>
				</div>

				<div class="flex flex-wrap gap-3">
					<a
						href={resolve('/showcase')}
						class="btn rounded-full border-none bg-[var(--maif-red)] px-6 text-white hover:bg-[var(--maif-red-deep)]"
					>
						Voir le showcase
					</a>
					<a
						href={resolve('/about')}
						class="btn rounded-full border border-slate-300 bg-white/70 btn-ghost px-6 text-slate-700 hover:bg-white"
					>
						Comprendre la structure
					</a>
				</div>

				<div class="grid gap-4 pt-3 md:grid-cols-3">
					{#each metrics as metric (metric.label)}
						<article class="kpi-card p-5">
							<p class="text-sm font-medium text-slate-500">{metric.label}</p>
							<p class="mt-3 text-3xl font-extrabold text-slate-950">{metric.value}</p>
							<p class="mt-2 text-sm text-slate-600">{metric.detail}</p>
						</article>
					{/each}
				</div>
			</div>
		</div>

		<aside class="surface-card flex flex-col justify-between p-8">
			<div class="space-y-6">
				<div>
					<p class="eyebrow">Signature visuelle</p>
					<h3 class="mt-3 text-2xl font-bold text-slate-950">Palette et structure reprises</h3>
				</div>

				<ul class="space-y-4 text-sm text-slate-600">
					<li class="flex items-center gap-3">
						<span class="h-3 w-3 rounded-full bg-[var(--maif-red)]"></span>
						Rouge MAIF comme accent principal et action primaire
					</li>
					<li class="flex items-center gap-3">
						<span class="h-3 w-3 rounded-full bg-slate-800"></span>
						Base gris ardoise pour la lisibilité et la hiérarchie du contenu
					</li>
					<li class="flex items-center gap-3">
						<span class="h-3 w-3 rounded-full bg-sky-200"></span>
						Mise en atmosphère avec dégradés légers et panneaux translucides
					</li>
				</ul>
			</div>

			<div class="rounded-2xl border border-slate-200 bg-white/80 p-5">
				<p class="text-sm font-semibold text-slate-500">Points de structure conservés</p>
				<ul class="mt-4 space-y-3 text-sm leading-6 text-slate-700">
					{#each steps as step (step)}
						<li>{step}</li>
					{/each}
				</ul>
			</div>
		</aside>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		{#each highlights as highlight (highlight.title)}
			<article class="surface-card p-6">
				<div class="flex items-center justify-between gap-4">
					<span
						class="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-red-700 uppercase"
					>
						{highlight.badge}
					</span>
					<span class="text-sm text-slate-400">Module démo</span>
				</div>
				<h3 class="mt-5 text-2xl font-bold text-slate-950">{highlight.title}</h3>
				<p class="mt-3 text-sm leading-7 text-slate-600">{highlight.description}</p>
				<div class="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-sm">
					<span class="font-medium text-slate-500">Prototype navigable</span>
					<a href={resolve('/showcase')} class="font-semibold text-[var(--maif-red)]">Explorer</a>
				</div>
			</article>
		{/each}
	</div>
</section>
