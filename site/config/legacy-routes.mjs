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
	'cam-debug-view',
	'cam-export',
	'cam-tabs-clamps',
	'machine-library',
	'post-processor-converter',
	'sketch-export',
	'sketch-toolpaths',
	'view-3d',
	'view-simulation',
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
	// Migrated: all of the Sketch view's destinations are now on the workspace page.
	{
		from: '/guide/view-sketch.html',
		to: '/guide/fundamentals/workspace/',
		anchors: {
			'sketch-overview': '/guide/fundamentals/workspace/#views',
			'sketch-navigation': '/guide/fundamentals/workspace/#navigation',
			'sketch-overlays': '/guide/fundamentals/workspace/#sketch-overlays',
			'sketch-workflow': '/guide/fundamentals/workspace/#views',
		},
	},
	// Migrated: the Interface page is split across the Fundamentals pages. W3 supplies
	// `cam-panel` when Working with operations exists.
	{
		from: '/guide/interface.html',
		to: '/guide/fundamentals/workspace/',
		anchors: {
			layout: '/guide/fundamentals/workspace/',
			'starting-a-project': '/guide/fundamentals/projects-and-files/',
			toolbar: '/guide/fundamentals/workspace/#top-toolbar',
			'feature-tree': '/guide/fundamentals/feature-tree/',
			'properties-panel': '/guide/fundamentals/feature-tree/#properties',
			'canvas-workflow-panels': '/guide/fundamentals/workspace/#workflow-panels',
			'tablet-shell': '/guide/fundamentals/tablet-and-touch/',
		},
	},
	// Migrated: the Concepts page is split across the Fundamentals pages.
	{
		from: '/guide/concepts.html',
		to: '/guide/fundamentals/features-and-roles/',
		anchors: {
			features: '/guide/fundamentals/features-and-roles/',
			'z-coordinates': '/guide/fundamentals/features-and-roles/#z-range',
			'add-subtract': '/guide/fundamentals/features-and-roles/#roles',
			regions: '/guide/fundamentals/regions/',
			construction: '/guide/fundamentals/construction-geometry/',
			'tree-order': '/guide/fundamentals/features-and-roles/#order',
			'feature-references': '/guide/fundamentals/linked-features/',
			visibility: '/guide/fundamentals/feature-tree/#visibility',
			stock: '/guide/fundamentals/stock-origin-units/#stock',
			origin: '/guide/fundamentals/stock-origin-units/#origin',
			units: '/guide/fundamentals/stock-origin-units/#units',
		},
	},
	// Migrated: the new page keeps the legacy heading ids, so fragments pass through.
	{ from: '/guide/appearance.html', to: '/guide/reference/themes/' },
	{
		from: '/guide/language.html',
		to: '/guide/reference/languages/',
		anchors: {
			'switching-language': '/guide/reference/languages/',
		},
	},
	// Migrated: the Drawing Tools page is split across the Design pages.
	{
		from: '/guide/sketch-tools.html',
		to: '/guide/design/drawing-tools/',
		anchors: {
			overview: '/guide/design/drawing-tools/',
			text: '/guide/design/text/#placing-text',
			'more-shapes': '/guide/design/parametric-shapes/',
			'canvas-navigation': '/guide/fundamentals/workspace/#navigation',
		},
	},
	{
		from: '/guide/sketch-text.html',
		to: '/guide/design/text/',
		anchors: {
			'text-overview': '/guide/design/text/',
			'text-cam': '/guide/design/text/#machining-text',
		},
	},
	// Migrated: the Design pages now cover all Sketch edit sections.
	{
		from: '/guide/sketch-edit.html',
		to: '/guide/design/selecting-and-transforming/',
		anchors: {
			selecting: '/guide/design/selecting-and-transforming/',
			alignment: '/guide/design/arranging/',
			'feature-distribution': '/guide/design/arranging/#feature-distribution',
			'shape-ops': '/guide/design/shape-operations/',
			'sketch-edit': '/guide/design/sketch-editing/',
			constraints: '/guide/design/dimensions-and-constraints/#constraints',
			locking: '/guide/fundamentals/feature-tree/#visibility',
		},
	},
	// Migrated: dimensions and snapping each have their own Design page.
	{
		from: '/guide/sketch-dimensions.html',
		to: '/guide/design/dimensions-and-constraints/',
		anchors: {
			overview: '/guide/design/dimensions-and-constraints/',
			toolbar: '/guide/design/dimensions-and-constraints/#toolbar',
			'tape-measure': '/guide/design/dimensions-and-constraints/#tape',
			'placing-dimensions': '/guide/design/dimensions-and-constraints/#placing',
			'editing-dimensions': '/guide/design/dimensions-and-constraints/#driving',
			visibility: '/guide/design/dimensions-and-constraints/#visibility',
			limits: '/guide/design/dimensions-and-constraints/#limits',
		},
	},
	{
		from: '/guide/sketch-snapping.html',
		to: '/guide/design/snapping-and-grid/',
		anchors: {
			'snap-overview': '/guide/design/snapping-and-grid/',
			'snap-modes': '/guide/design/snapping-and-grid/#modes',
			'grid-settings': '/guide/design/snapping-and-grid/#grid',
			'axis-lock': '/guide/design/snapping-and-grid/#axis-lock',
		},
	},
	// Migrated: imports are split by source type, with backdrop images as their own task.
	{
		from: '/guide/sketch-import.html',
		to: '/guide/design/importing-2d/',
		anchors: {
			'import-overview': '/guide/design/importing-2d/',
			'svg-import': '/guide/design/importing-2d/#svg',
			'dxf-import': '/guide/design/importing-2d/#dxf',
			'stl-obj-import': '/guide/design/importing-3d-models/',
			'camj-import': '/guide/design/importing-2d/#camj',
			'after-import': '/guide/design/importing-2d/#after-import',
			backdrop: '/guide/design/backdrop-images/',
		},
	},
	...PENDING_GUIDE_PAGES.map((name) => ({
		from: `/guide/${name}.html`,
		to: '/guide/',
		pending: true,
	})),
];
