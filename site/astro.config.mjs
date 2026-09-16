// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import siteArtifact from './integrations/site-artifact.mjs';

export default defineConfig({
	site: 'https://purecutcnc.github.io',
	// GitHub Pages serves `/guide/page/` from `guide/page/index.html` and redirects the
	// slash-less form, so generated links always carry the trailing slash.
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: 'PureCut CNC',
			description:
				'User manual for PureCut CNC, a 2.5D + 3D CAD/CAM workspace for desktop and the browser.',
			favicon: '/favicon.svg',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/PureCutCNC/purecutcnc' }],
			editLink: {
				baseUrl: 'https://github.com/PureCutCNC/purecutcnc.github.io/edit/main/site/',
			},
			customCss: ['./src/styles/tokens.css', './src/styles/starlight.css'],
			components: {
				Header: './src/components/starlight/Header.astro',
				MobileMenuFooter: './src/components/starlight/MobileMenuFooter.astro',
				SiteTitle: './src/components/starlight/SiteTitle.astro',
			},
			head: [
				{
					tag: 'script',
					attrs: {
						'data-goatcounter': 'https://purecutcnc.goatcounter.com/count',
						async: true,
						src: 'https://gc.zgo.at/count.js',
					},
				},
			],
			credits: false,
			// Provisional sections for the platform spike; the real tree is the #22 deliverable.
			// Sections list their folder's pages automatically (ordered by `sidebar.order`
			// frontmatter), so adding a page never requires editing this file.
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Manual overview', slug: 'guide' },
						{ label: 'Quick Start', slug: 'quickstart' },
					],
				},
				{ label: 'CAM Setup', items: [{ autogenerate: { directory: 'guide/cam-setup' } }] },
				{ label: 'Machining Operations', items: [{ autogenerate: { directory: 'guide/operations' } }] },
			],
		}),
		// Must stay after Starlight: its build hook runs once the search index exists.
		siteArtifact(),
	],
});
