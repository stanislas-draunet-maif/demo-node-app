<script lang="ts">
	import { page } from '$app/state';
	import logoMaif from '$lib/assets/logo-maif.svg';

	const items: { label: string; href: string }[] = [
		{ label: 'Accueil', href: '/' },
		{ label: 'Showcase', href: '/showcase' },
		{ label: 'A propos', href: '/about' }
	];

	let open = $state(false);
	const pathname = $derived(page.url.pathname);
	const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
</script>

<header class="border-b border-white/70 bg-white/90 text-slate-900 backdrop-blur">
	<nav class="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4">
		<div class="flex min-w-0 items-center gap-4">
			<a href="/" class="shrink-0" aria-label="Accueil">
				<img src={logoMaif} alt="MAIF" class="h-12 w-auto" />
			</a>

			<a href="/" class="block min-w-0">
				<p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--maif-red)]">
					Demo Svelte
				</p>
				<h1 class="truncate text-3xl font-extrabold tracking-tight text-slate-950 md:text-4xl">
					Portail Services & Parcours
				</h1>
			</a>
		</div>

		<button
			class="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 md:hidden"
			aria-expanded={open}
			aria-controls="nav-menu"
			onclick={() => (open = !open)}
		>
			Menu
		</button>

		<div class="hidden flex-col gap-2 md:flex">
			<span class="text-xs font-medium text-slate-500">Choisissez une vue</span>
			<ul
				id="nav-menu"
				class="flex items-stretch overflow-hidden rounded-2xl border border-slate-300 bg-white text-sm shadow-sm"
			>
				{#each items as item, i}
					<li class="contents">
						<a
							href={item.href}
							aria-current={isActive(item.href) ? 'page' : undefined}
							class:list-active={isActive(item.href)}
							class:border-l={i > 0}
							class="px-4 py-2 whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50"
						>
							{item.label}
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</nav>

	{#if open}
		<div class="border-t border-slate-200/70 md:hidden">
			<div class="px-6 py-3">
				<div class="mb-2 text-xs font-medium text-slate-500">Choisissez une vue</div>
				<ul class="space-y-2">
					{#each items as item}
						<li>
							<a
								href={item.href}
								class:list-active={isActive(item.href)}
								class="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
								onclick={() => (open = false)}
								aria-current={isActive(item.href) ? 'page' : undefined}
							>
								{item.label}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
</header>