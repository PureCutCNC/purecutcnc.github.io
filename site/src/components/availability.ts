// Wording for non-stable features, shared by the page-level notice (PageTitle
// override) and the inline <Availability> badge, so every page says it the same way.

export type NonStableAvailability = 'preview' | 'experimental';

export const AVAILABILITY: Record<
	NonStableAvailability,
	{ label: string; badgeVariant: 'caution' | 'danger'; asideType: 'caution' | 'danger'; pageText: string }
> = {
	preview: {
		label: 'Preview Build',
		badgeVariant: 'caution',
		asideType: 'caution',
		pageText:
			'This page describes a feature that is in the Preview Build but not yet in a stable release. It may change before it ships.',
	},
	experimental: {
		label: 'Experimental',
		badgeVariant: 'danger',
		asideType: 'caution',
		pageText:
			'This feature is experimental: it may change or be removed, and its results need extra checking before you cut.',
	},
};
