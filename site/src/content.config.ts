import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { PAGE_TYPES } from '../config/manual-structure.mjs';

// User Guide frontmatter (planning/MANUAL_BLUEPRINT.md § Frontmatter). The build
// rejects a page whose fields break these types. Rules that span fields or files
// (title and type match the page tree, a reviewed page names its app commit,
// required headings) are checked by scripts/check-content.mjs.
const manualFields = z.object({
	/** Which template the page follows. Must match config/manual-structure.mjs. */
	pageType: z.enum(PAGE_TYPES as [string, ...string[]]),
	/**
	 * Where the documented behaviour ships. `preview`: only in the Preview Build so
	 * far. `experimental`: shipped, but labelled experimental in the app or by
	 * product decision. Non-stable pages show a notice under the title.
	 */
	availability: z.enum(['stable', 'preview', 'experimental']),
	/** `reviewed` pages have been checked against the app by the page's technical reviewer. */
	status: z.enum(['draft', 'reviewed']),
	/** The app state a reviewed page was checked against. */
	reviewed: z
		.object({
			appCommit: z.string().regex(/^[0-9a-f]{40}$/, 'Use the full 40-character PureCutCNC/purecutcnc commit SHA'),
			date: z.coerce.date(),
			by: z.string().min(1),
		})
		.optional(),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: manualFields }) }),
};
