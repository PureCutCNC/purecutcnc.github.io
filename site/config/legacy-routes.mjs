// Compatibility map for URLs published by the hand-maintained site.
//
// Every entry becomes a static redirect page at exactly `from` in the built artifact
// (see integrations/site-artifact.mjs). The redirect page keeps the query string and
// `#fragment`, and `anchors` can send an old fragment to a different page, which is how
// one legacy page is split across several new pages.
//
//   from     legacy path, including `.html`
//   to       new canonical URL (trailing slash)
//   anchors  optional { oldFragment: 'new/url/#new-fragment' }
//   pending  true while the legacy page has not been migrated; `to` is then only a
//            placeholder. `npm run verify:cutover` fails while any entry is pending.
//
// `/index.html` and `/guide/index.html` are not listed: the new build serves real
// pages at those paths.

/** Legacy guide pages that have not been migrated yet. */
const PENDING_GUIDE_PAGES = [
	'appearance',
	'cam-debug-view',
	'cam-export',
	'cam-tabs-clamps',
	'concepts',
	'interface',
	'language',
	'machine-library',
	'post-processor-converter',
	'sketch-dimensions',
	'sketch-edit',
	'sketch-export',
	'sketch-import',
	'sketch-snapping',
	'sketch-text',
	'sketch-toolpaths',
	'sketch-tools',
	'view-3d',
	'view-simulation',
	'view-sketch',
];

/** @type {{ from: string, to: string, anchors?: Record<string, string>, pending?: boolean }[]} */
export const LEGACY_ROUTES = [
	{ from: '/downloads.html', to: '/downloads/' },
	{
		from: '/quickstart.html',
		to: '/quickstart/',
		anchors: {
			top: '/quickstart/',
			'step-project': '/quickstart/#create-a-new-project',
			'step-rect': '/quickstart/#add-the-outer-boundary-rectangle',
			'step-circle': '/quickstart/#add-a-circle-inside-the-rectangle',
			'step-tool': '/quickstart/#import-a-14-endmill-from-the-tool-library',
			'step-operation': '/quickstart/#create-a-rough-pocket-operation',
			'step-preview': '/quickstart/#preview-the-toolpath',
			'step-export': '/quickstart/#select-a-machine-and-export-g-code',
		},
	},
	// Migrated: the new page keeps the legacy heading ids, so fragments pass through.
	{ from: '/guide/cam-tools.html', to: '/guide/cam-setup/tool-library/' },
	// Split page: only the Pocket card has a destination so far.
	{
		from: '/guide/cam-operations.html',
		to: '/guide/',
		pending: true,
		anchors: {
			'op-pocket': '/guide/operations/pocket/',
		},
	},
	...PENDING_GUIDE_PAGES.map((name) => ({
		from: `/guide/${name}.html`,
		to: '/guide/',
		pending: true,
	})),
];
