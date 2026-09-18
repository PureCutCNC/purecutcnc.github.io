// The approved User Guide page tree (issue #22, planning/MANUAL_BLUEPRINT.md).
//
// This file is the single source for:
//   - the sidebar (astro.config.mjs lists each planned page whose file exists);
//   - page titles and page types (scripts/check-content.mjs compares frontmatter);
//   - Wave 2 page ownership (scripts/check-coverage.mjs checks every destination).
//
// Adding, renaming, or moving a page is an information-architecture change: edit it
// here, in the same pull request, and add a redirect if a published URL changes.

/** Sidebar groups, in display order. `dir` is the folder under src/content/docs/guide/. */
export const SECTIONS = [
	{ slug: 'start-here', label: 'Start Here', dir: 'start-here' },
	{ slug: 'fundamentals', label: 'Fundamentals', dir: 'fundamentals' },
	{ slug: 'design', label: 'Design', dir: 'design' },
	{ slug: 'cam-setup', label: 'CAM Setup', dir: 'cam-setup' },
	{ slug: 'operations', label: 'Machining Operations', dir: 'operations' },
	{ slug: 'strategies', label: 'Advanced Strategies', dir: 'strategies' },
	{ slug: 'verify-export', label: 'Verify and Export', dir: 'verify-export' },
	{ slug: 'reference', label: 'Reference and Troubleshooting', dir: 'reference' },
];

/**
 * Page types. Each one has a template in site/templates/ and a set of required
 * second-level headings (see REQUIRED_HEADINGS in scripts/check-content.mjs).
 */
export const PAGE_TYPES = ['overview', 'tutorial', 'concept', 'task', 'reference', 'operation', 'strategy', 'troubleshooting', 'utility'];

const page = (path, section, title, type, owner, label) => ({ path, section, title, type, owner, ...(label ? { label } : {}) });

/** Planned pages, in sidebar order within each section. */
export const PAGES = [
	page('/guide/', 'start-here', 'PureCutCNC User Guide', 'overview', 'W1', 'Guide overview'),
	page('/quickstart/', 'start-here', 'Quick Start', 'tutorial', 'W1'),
	page('/guide/start-here/install-and-open/', 'start-here', 'Install and open PureCutCNC', 'task', 'W1'),
	page('/guide/start-here/safety/', 'start-here', 'Working safely', 'concept', 'W1'),

	page('/guide/fundamentals/workspace/', 'fundamentals', 'The workspace', 'concept', 'W1'),
	page('/guide/fundamentals/projects-and-files/', 'fundamentals', 'Projects and files', 'task', 'W1'),
	page('/guide/fundamentals/features-and-roles/', 'fundamentals', 'Features, roles, and depth', 'concept', 'W1'),
	page('/guide/fundamentals/feature-tree/', 'fundamentals', 'Feature tree and properties', 'reference', 'W1'),
	page('/guide/fundamentals/linked-features/', 'fundamentals', 'Linked features', 'concept', 'W1'),
	page('/guide/fundamentals/stock-origin-units/', 'fundamentals', 'Stock, origin, and units', 'task', 'W1'),
	page('/guide/fundamentals/regions/', 'fundamentals', 'Regions', 'concept', 'W1'),
	page('/guide/fundamentals/construction-geometry/', 'fundamentals', 'Construction geometry', 'concept', 'W1'),
	page('/guide/fundamentals/tablet-and-touch/', 'fundamentals', 'Tablet and touch', 'reference', 'W1'),

	page('/guide/design/drawing-tools/', 'design', 'Drawing tools', 'task', 'W2'),
	page('/guide/design/parametric-shapes/', 'design', 'Slots, polygons, and gears', 'task', 'W2'),
	page('/guide/design/text/', 'design', 'Text', 'task', 'W2'),
	page('/guide/design/selecting-and-transforming/', 'design', 'Selecting and transforming', 'task', 'W2'),
	page('/guide/design/arranging/', 'design', 'Aligning and distributing', 'task', 'W2'),
	page('/guide/design/shape-operations/', 'design', 'Offset, join, and cut', 'task', 'W2'),
	page('/guide/design/sketch-editing/', 'design', 'Editing sketches', 'task', 'W2'),
	page('/guide/design/snapping-and-grid/', 'design', 'Snapping and the grid', 'reference', 'W2'),
	page('/guide/design/dimensions-and-constraints/', 'design', 'Dimensions and constraints', 'task', 'W2'),
	page('/guide/design/importing-2d/', 'design', 'Importing SVG, DXF, and projects', 'task', 'W2'),
	page('/guide/design/importing-3d-models/', 'design', 'Importing 3D models', 'task', 'W2'),
	page('/guide/design/backdrop-images/', 'design', 'Backdrop images', 'task', 'W2'),

	page('/guide/cam-setup/tool-library/', 'cam-setup', 'Tool library', 'reference', 'W3'),
	page('/guide/cam-setup/working-with-operations/', 'cam-setup', 'Working with operations', 'task', 'W3'),
	page('/guide/cam-setup/cam-plan/', 'cam-setup', 'CAM Plan', 'task', 'W3'),
	page('/guide/cam-setup/machines/', 'cam-setup', 'Machines', 'task', 'W3'),
	page('/guide/cam-setup/tabs/', 'cam-setup', 'Tabs', 'task', 'W3'),
	page('/guide/cam-setup/clamps-and-clearances/', 'cam-setup', 'Clamps and clearances', 'task', 'W3'),

	page('/guide/operations/', 'operations', 'Choosing an operation', 'overview', 'W3'),
	page('/guide/operations/common-parameters/', 'operations', 'Common operation parameters', 'reference', 'W3'),
	page('/guide/operations/pocket/', 'operations', 'Pocket', 'operation', 'W3'),
	page('/guide/operations/surface-clean/', 'operations', 'Surface clean', 'operation', 'W3'),
	page('/guide/operations/edge-route-inside/', 'operations', 'Edge route inside', 'operation', 'W3'),
	page('/guide/operations/edge-route-outside/', 'operations', 'Edge route outside', 'operation', 'W3'),
	page('/guide/operations/v-carve-offset/', 'operations', 'V-carve offset', 'operation', 'W3'),
	page('/guide/operations/v-carve-medial/', 'operations', 'V-carve medial', 'operation', 'W3'),
	page('/guide/operations/engrave/', 'operations', 'Engrave', 'operation', 'W3'),
	page('/guide/operations/drill/', 'operations', 'Drill', 'operation', 'W3'),
	page('/guide/operations/3d-surface-rough/', 'operations', '3D surface rough', 'operation', 'W4'),
	page('/guide/operations/3d-surface-finish/', 'operations', '3D surface finish', 'operation', 'W4'),
	page('/guide/operations/3d-surface-cleanup/', 'operations', '3D surface cleanup', 'operation', 'W4'),

	page('/guide/strategies/clearing-patterns/', 'strategies', 'Clearing patterns', 'strategy', 'W4'),
	page('/guide/strategies/trochoidal-cutting/', 'strategies', 'Trochoidal cutting', 'strategy', 'W4'),
	page('/guide/strategies/entry-and-exit/', 'strategies', 'Entry and exit moves', 'strategy', 'W4'),
	page('/guide/strategies/corners/', 'strategies', 'Corner rounding and relief', 'strategy', 'W4'),
	page('/guide/strategies/feed-reduction/', 'strategies', 'Feed reduction', 'strategy', 'W4'),
	page('/guide/strategies/rest-machining/', 'strategies', 'Rest machining', 'strategy', 'W4'),
	page('/guide/strategies/3d-finishing/', 'strategies', '3D finishing controls', 'strategy', 'W4'),

	page('/guide/verify-export/toolpath-preview/', 'verify-export', 'Toolpath preview', 'reference', 'W5'),
	page('/guide/verify-export/3d-view/', 'verify-export', '3D view', 'reference', 'W5'),
	page('/guide/verify-export/simulation/', 'verify-export', 'Simulation', 'task', 'W5'),
	page('/guide/verify-export/gcode-export/', 'verify-export', 'Exporting G-code', 'task', 'W5'),
	page('/guide/verify-export/exported-motion/', 'verify-export', 'Exported motion inspector', 'reference', 'W5'),
	page('/guide/verify-export/setup-booklets/', 'verify-export', 'Setup booklets', 'task', 'W5'),
	page('/guide/verify-export/model-export-and-print/', 'verify-export', 'Exporting models and printing', 'task', 'W5'),

	page('/guide/reference/keyboard-shortcuts/', 'reference', 'Keyboard shortcuts', 'reference', 'W1'),
	page('/guide/reference/file-formats/', 'reference', 'File formats', 'reference', 'W5'),
	page('/guide/reference/machine-definitions/', 'reference', 'Machine definition reference', 'reference', 'W5'),
	page('/guide/reference/post-processor-converter/', 'reference', 'Post-processor converter', 'reference', 'W5'),
	page('/guide/reference/themes/', 'reference', 'Themes and appearance', 'reference', 'W1'),
	page('/guide/reference/languages/', 'reference', 'Interface languages', 'reference', 'W1'),
	page('/guide/reference/warnings/', 'reference', 'Warnings and messages', 'reference', 'W5'),
	page('/guide/reference/troubleshooting/', 'reference', 'Troubleshooting', 'troubleshooting', 'W5'),
	page('/guide/reference/glossary/', 'reference', 'Glossary', 'reference', 'W1'),
	page('/guide/reference/privacy-and-data/', 'reference', 'Privacy and data', 'reference', 'W1'),
];

/** Content entries that are not part of the guide tree. */
export const UTILITY_PAGES = [{ path: '/404/', title: 'Page not found', type: 'utility' }];

/** Site path of a docs entry, from its path relative to src/content/docs/. */
export function pagePathForFile(relativeFile) {
	const withoutExt = relativeFile.replace(/\\/g, '/').replace(/\.(md|mdx)$/, '');
	const slug = withoutExt.replace(/(^|\/)index$/, '');
	return slug ? `/${slug}/` : '/';
}

/** Docs entry slug (for Starlight sidebar items) of a planned page. */
export function slugForPage(pagePath) {
	return pagePath.replace(/^\/|\/$/g, '');
}

/**
 * Folder, under src/assets/manual/, that holds a page's screenshots and diagrams.
 * `/guide/cam-setup/tool-library/` → `cam-setup/tool-library`; `/guide/` → `guide-overview`;
 * `/guide/operations/` → `operations/index`; `/quickstart/` → `quickstart`.
 */
export function assetDirForPage(pagePath) {
	if (pagePath === '/guide/') return 'guide-overview';
	const rest = pagePath.replace(/^\/guide\//, '').replace(/^\//, '').replace(/\/$/, '');
	return SECTIONS.some((section) => section.dir === rest) ? `${rest}/index` : rest;
}

export function plannedPage(pagePath) {
	return PAGES.find((entry) => entry.path === pagePath) ?? UTILITY_PAGES.find((entry) => entry.path === pagePath) ?? null;
}
