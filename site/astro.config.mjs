// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { existsSync } from 'node:fs';
import siteArtifact from './integrations/site-artifact.mjs';
import { PAGES, SECTIONS, slugForPage } from './config/manual-structure.mjs';

/**
 * Sidebar from the approved page tree: each section lists its planned pages that
 * exist, in planned order, and a section with no pages yet is left out. Content
 * pull requests therefore never edit this file.
 */
function guideSidebar() {
	const docsDir = new URL('./src/content/docs/', import.meta.url);
	/** @param {string} slug */
	const exists = (slug) =>
		['.md', '.mdx', '/index.md', '/index.mdx'].some((suffix) => existsSync(new URL(`${slug}${suffix}`, docsDir)));
	return SECTIONS.map((section) => ({
		label: section.label,
		items: PAGES.filter((entry) => entry.section === section.slug && exists(slugForPage(entry.path))).map((entry) => ({
			slug: slugForPage(entry.path),
			...(entry.label ? { label: entry.label } : {}),
		})),
	})).filter((group) => group.items.length > 0);
}

export default defineConfig({
	site: 'https://purecutcnc.github.io',
	// GitHub Pages serves `/guide/page/` from `guide/page/index.html` and redirects the
	// slash-less form, so generated links always carry the trailing slash.
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: 'PureCutCNC',
			description:
				'User Guide for PureCutCNC, a 2.5D + 3D CAD/CAM workspace for desktop and the browser.',
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
				PageTitle: './src/components/starlight/PageTitle.astro',
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
			// The User Guide tree lives in config/manual-structure.mjs (issue #22).
			sidebar: guideSidebar(),
		}),
		// Must stay after Starlight: its build hook runs once the search index exists.
		siteArtifact(),
	],
});
