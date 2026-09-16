import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Provisional manual metadata. The final required fields and page types come from the
// information-architecture work (#22); the build already rejects pages that break this
// schema, so tightening it later is a one-file change.
const manualFields = z.object({
	/** What kind of page this is, which decides the template it follows. */
	pageType: z.enum(['overview', 'tutorial', 'task', 'reference', 'troubleshooting']).optional(),
	/** The app state the page was last checked against. */
	reviewed: z
		.object({
			appCommit: z.string().regex(/^[0-9a-f]{7,40}$/, 'Use a PureCutCNC/purecutcnc commit SHA'),
			date: z.coerce.date(),
		})
		.optional(),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: manualFields }) }),
};
