#!/usr/bin/env node
// Checks User Guide pages, templates, and the screenshot manifest against the
// authoring standard in planning/MANUAL_BLUEPRINT.md.
//
//   node scripts/check-content.mjs             validate and summarise
//   node scripts/check-content.mjs --cutover   also require every planned page, every
//                                              page reviewed, and every screenshot current
//
// The Astro content schema (src/content.config.ts) already rejects bad field types
// at build time. This script covers the rules that span fields and files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import yaml from 'js-yaml';
import { PAGES, PAGE_TYPES, UTILITY_PAGES, assetDirForPage, pagePathForFile, plannedPage } from '../config/manual-structure.mjs';

const SITE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOCS_DIR = path.join(SITE_ROOT, 'src/content/docs');
const TEMPLATES_DIR = path.join(SITE_ROOT, 'templates');
const MANUAL_ASSETS_DIR = path.join(SITE_ROOT, 'src/assets/manual');
const MEDIA_MANIFEST = path.join(MANUAL_ASSETS_DIR, 'media.json');
const VISUAL_INVENTORY = path.join(SITE_ROOT, '../planning/manual-visual-inventory.json');

const { values: args } = parseArgs({ options: { cutover: { type: 'boolean', default: false } } });

/** Second-level headings each page type must contain, in this order. */
export const REQUIRED_HEADINGS = {
	overview: [],
	tutorial: ['Next steps'],
	concept: ['Related pages'],
	task: ['Related pages'],
	reference: ['Related pages'],
	operation: ['Requirements', 'Parameters', 'Verifying the result', 'Related pages'],
	strategy: ['How it works', 'Where it applies', 'Settings', 'Limitations', 'Related pages'],
	troubleshooting: ['Related pages'],
	utility: [],
};

/**
 * Terminology, checked in prose. Bold text (UI labels, quoted as the app shows them),
 * code, link targets, and import lines are exempt, except for rules marked `labels`:
 * those cover app labels with a filed fix, which the guide already writes correctly.
 */
export const TERMINOLOGY = [
	[/\bG-Code\b|\bGCode\b|\bGcode\b/, 'write "G-code"'],
	[/\btool paths?\b/i, 'write "toolpath"'],
	[/\bstep[ -]over\b/i, 'write "stepover"'],
	[/\bstep[ -]down\b/i, 'write "stepdown"'],
	[/\bend[ -]mills?\b/i, 'write "endmill"'],
	[/\bV-C(?:arve|ARVE)\b|\bv-carve\b|\b[Vv] ?[Cc]arve\b/, 'write "V-carve"'],
	// Bundled tool names such as `60° V-Bit` are names, not labels, and keep their spelling.
	[/(?<!°\s)\bV-Bit\b|\bVbit\b|\bV bit\b/, 'write "V-bit", including the tool type label (PureCutCNC/purecutcnc#797)', { labels: true }],
	[/\b(?:Top|Bottom) Z\b|\bZ[ -]?(?:Top|Bottom)\b|\bZ(?:top|bottom)\b/, 'write "Z top" / "Z bottom", including labels (PureCutCNC/purecutcnc#797)', { labels: true }],
	[/\bPureCut\s+CNC\b|\bPure\s+Cut\b|\bPurecut\b/, 'write "PureCutCNC"', { labels: true }],
	[/\buser manual\b/i, 'the guide is called the "User Guide"'],
	[/\bpreview build\b/, 'write "Preview Build"'],
	[/\bclick on\b/i, 'write "click"'],
	[/\be\.g\.|\bi\.e\./, 'write "for example" or "that is"'],
];

const MEDIA_EXTENSIONS = /\.(png|jpe?g|webp|svg)$/i;
const MEDIA_SOURCES = ['capture', 'legacy-guide', 'diagram'];
const MEDIA_STATUSES = ['current', 'reshoot'];
// The project a capture can be retaken from. This was free text, so nothing stopped a label
// nobody had defined. "Blank imperial"/"Blank metric" name a New project template; "Empty
// project" is the untouched project the app opens with. "site:<path>" is a page of this
// site rather than the app, which has no project and no app commit behind it. See
// MANUAL_BLUEPRINT.md.
const MEDIA_FIXTURE =
	/^(Empty project|Blank imperial|Blank metric|Example: .+|site\/fixtures\/[\w./-]+|app:[\w./-]+|site:\/[\w./-]*)$/;
/** A capture of this site's own pages, which records no app commit. */
const isSiteCapture = (fixture) => typeof fixture === 'string' && fixture.startsWith('site:');
const VISUAL_KINDS = ['screenshot', 'diagram'];
const VISUAL_STATUSES = ['proposed', 'planned', 'blocked', 'captured'];

const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

function listFiles(dir, filter) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && filter(entry.name))
		.map((entry) => path.join(entry.parentPath, entry.name));
}

function splitFrontmatter(text, where) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!match) {
		fail(where, 'missing frontmatter');
		return { data: {}, body: text, bodyLine: 1 };
	}
	let data = {};
	try {
		data = yaml.load(match[1]) ?? {};
	} catch (error) {
		fail(where, `frontmatter is not valid YAML: ${error.message}`);
	}
	return { data, body: text.slice(match[0].length), bodyLine: match[0].split('\n').length };
}

/** Body lines with fenced code removed (kept as blank lines so numbers stay right). */
function proseLines(body) {
	let fenced = false;
	return body.split('\n').map((line) => {
		if (/^\s*(```|~~~)/.test(line)) {
			fenced = !fenced;
			return '';
		}
		return fenced ? '' : line;
	});
}

function stripForTerminology(line, { keepLabels = false } = {}) {
	if (/^\s*(import|export)\s/.test(line) || /<VisualPending\b/.test(line)) return '';
	return line
		.replace(/`[^`]*`/g, ' ')
		.replace(/\*\*[^*]+\*\*/g, (label) => (keepLabels ? label : ' '))
		.replace(/\]\([^)]*\)/g, ']')
		.replace(/\b(src|href|slug|link)=("[^"]*"|\{[^}]*\})/g, ' ')
		.replace(/https?:\/\/\S+/g, ' ');
}

function checkTerminology(where, text, lineOffset = 0) {
	text.split('\n').forEach((line, index) => {
		const prose = stripForTerminology(line);
		const withLabels = stripForTerminology(line, { keepLabels: true });
		for (const [pattern, advice, options] of TERMINOLOGY) {
			const match = (options?.labels ? withLabels : prose).match(pattern);
			if (match) fail(`${where}:${index + 1 + lineOffset}`, `"${match[0]}": ${advice}`);
		}
	});
}

/** Every human-readable string in the frontmatter, one per line (links and flags skipped). */
function frontmatterText(value, key = '') {
	if (typeof value === 'string') return /^(link|href|template|pageType|availability|status|icon|variant)$/.test(key) ? '' : value;
	if (Array.isArray(value)) return value.map((item) => frontmatterText(item, key)).join('\n');
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		return Object.entries(value).map(([name, item]) => frontmatterText(item, name)).join('\n');
	}
	return '';
}

function checkHeadings(where, lines, bodyLine, type) {
	const headings = [];
	lines.forEach((line, index) => {
		const match = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
		if (match) headings.push({ level: match[1].length, text: match[2], line: index + bodyLine });
	});
	let previous = 1;
	const seen = new Set();
	for (const heading of headings) {
		const at = `${where}:${heading.line}`;
		if (heading.level === 1) fail(at, 'do not use a level-1 heading; the page title is the only H1');
		if (heading.level > previous + 1) fail(at, `heading level jumps from H${previous} to H${heading.level}`);
		if (/[<>{}]/.test(heading.text)) fail(at, 'headings must be plain text (they become the anchor); put badges on the next line');
		const key = heading.text.toLowerCase();
		if (seen.has(key)) fail(at, `duplicate heading "${heading.text}" produces a numbered anchor`);
		seen.add(key);
		previous = heading.level;
	}
	const required = REQUIRED_HEADINGS[type] ?? [];
	const h2 = headings.filter((heading) => heading.level === 2).map((heading) => heading.text);
	let cursor = -1;
	for (const name of required) {
		const index = h2.indexOf(name);
		if (index === -1) fail(where, `${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type} page needs a "## ${name}" section`);
		else if (index < cursor) fail(where, `"## ${name}" is out of order (required order: ${required.join(', ')})`);
		else cursor = index;
	}
	const last = required.at(-1);
	if (last && h2.length && h2.at(-1) !== last && h2.includes(last)) fail(where, `"## ${last}" must be the last section`);
}

function checkBodyRules(where, lines, bodyLine, file, pagePath) {
	lines.forEach((line, index) => {
		const at = `${where}:${index + bodyLine}`;
		if (/!\[[^\]]*\]\(/.test(line)) fail(at, 'use <Screenshot> instead of Markdown image syntax');
		if (/<img\b/i.test(line)) fail(at, 'use <Screenshot> instead of <img>');
		if (/^\s*:::\w/.test(line)) fail(at, 'use the <Aside> component instead of ::: directives');
		if (/\bbanner:/.test(line) && index === 0) fail(at, 'notices come from frontmatter; do not add banners');
	});
	const body = lines.join('\n');
	for (const match of body.matchAll(/<Aside\b([^>]*)>/g)) {
		const attrs = match[1];
		if (/type=["']danger["']/.test(attrs) && !/title=["']Safety: [^"']+["']/.test(attrs)) {
			fail(where, 'a danger <Aside> is reserved for safety and needs title="Safety: …"');
		}
	}
	const assetDir = pagePath ? path.join(MANUAL_ASSETS_DIR, assetDirForPage(pagePath)) : null;
	const used = [];
	for (const match of body.matchAll(/^\s*import\s+\w+\s+from\s+['"]([^'"]+)['"]/gm)) {
		const specifier = match[1];
		if (!MEDIA_EXTENSIONS.test(specifier)) continue;
		const resolved = path.resolve(path.dirname(file), specifier);
		used.push(resolved);
		if (!existsSync(resolved)) fail(where, `image ${specifier} does not exist`);
		else if (assetDir && path.dirname(resolved) !== assetDir) {
			fail(where, `image ${specifier} must live in src/assets/manual/${assetDirForPage(pagePath)}/`);
		}
	}
	return used;
}

function checkFrontmatter(where, data, planned) {
	if (data.title !== planned.title) fail(where, `title must be "${planned.title}" (config/manual-structure.mjs)`);
	if (data.pageType !== planned.type) fail(where, `pageType must be "${planned.type}" (config/manual-structure.mjs)`);
	if (!PAGE_TYPES.includes(data.pageType)) fail(where, `unknown pageType "${data.pageType}"`);
	if (typeof data.description !== 'string' || !data.description.trim()) fail(where, 'description is required');
	else if (data.description.length > 170) fail(where, `description is ${data.description.length} characters; keep it under 170`);
	if (!['stable', 'preview', 'experimental'].includes(data.availability)) fail(where, 'availability must be stable, preview, or experimental');
	if (!['draft', 'reviewed'].includes(data.status)) fail(where, 'status must be draft or reviewed');
	if (planned.type !== 'utility') {
		if (data.banner) fail(where, 'do not set banner; draft and availability notices are generated');
		if (data.sidebar) fail(where, 'do not set sidebar; the sidebar comes from config/manual-structure.mjs');
		if (data.status === 'reviewed') {
			const reviewed = data.reviewed ?? {};
			if (!/^[0-9a-f]{40}$/.test(reviewed.appCommit ?? '')) fail(where, 'a reviewed page needs reviewed.appCommit (full SHA)');
			if (!(reviewed.date instanceof Date) && !/^\d{4}-\d{2}-\d{2}$/.test(String(reviewed.date ?? ''))) fail(where, 'a reviewed page needs reviewed.date (YYYY-MM-DD)');
			if (!reviewed.by) fail(where, 'a reviewed page needs reviewed.by');
		} else if (data.reviewed) {
			fail(where, 'reviewed metadata is only for status: reviewed');
		}
	}
}

function checkManifest(usedImages) {
	const where = 'src/assets/manual/media.json';
	let manifest = {};
	try {
		manifest = JSON.parse(readFileSync(MEDIA_MANIFEST, 'utf8'));
	} catch (error) {
		fail(where, `unreadable: ${error.message}`);
	}
	const files = listFiles(MANUAL_ASSETS_DIR, (name) => MEDIA_EXTENSIONS.test(name)).map((file) =>
		path.relative(MANUAL_ASSETS_DIR, file).split(path.sep).join('/'),
	);
	for (const file of files) if (!manifest[file]) fail(where, `${file} has no manifest entry`);
	const usedKeys = new Set(usedImages.map((file) => path.relative(MANUAL_ASSETS_DIR, file).split(path.sep).join('/')));
	const summary = { current: 0, reshoot: 0, blocked: [] };
	for (const [key, entry] of Object.entries(manifest)) {
		const at = `${where} ${key}`;
		if (!files.includes(key)) fail(at, 'file does not exist');
		if (!usedKeys.has(key)) warn(at, 'not used by any page');
		if (!entry.shows) fail(at, 'shows is required');
		if (!MEDIA_SOURCES.includes(entry.source)) fail(at, `source must be one of ${MEDIA_SOURCES.join(', ')}`);
		if (!MEDIA_STATUSES.includes(entry.status)) fail(at, `status must be one of ${MEDIA_STATUSES.join(', ')}`);
		if (!['dark', 'light'].includes(entry.theme)) fail(at, 'theme must be dark or light');
		if (entry.locale !== 'en') fail(at, 'locale must be en');
		if (entry.source === 'capture') {
			if (typeof entry.fixture !== 'string' || !MEDIA_FIXTURE.test(entry.fixture)) {
				fail(
					at,
					'fixture must be "Empty project", "Blank imperial", "Blank metric", "Example: <card name>", "site/fixtures/<file>", "app:<path>", or "site:<path>"',
				);
			}
			if (!/^\d+x\d+@\d(\.\d+)?x$/.test(entry.viewport ?? '')) fail(at, 'a capture needs viewport like 1440x900@2x');
			if (isSiteCapture(entry.fixture)) {
				// A page of this site has no app behind it, so an app commit would be noise.
				if (entry.appCommit != null) fail(at, 'a site: capture must not record appCommit');
			} else if (!/^[0-9a-f]{40}$/.test(entry.appCommit ?? '')) {
				fail(at, 'a capture needs appCommit (full SHA)');
			} else if (/^0{40}$/.test(entry.appCommit)) {
				// All-zero is 40 hex characters, so it passed the shape check while naming no
				// commit at all. npm run capture prints the real one.
				fail(at, 'appCommit is a placeholder; use the SHA that npm run capture prints');
			}
		}
		if (entry.source === 'legacy-guide' && entry.status !== 'reshoot') fail(at, 'legacy-guide images must be marked reshoot');
		const blockedBy = entry.blockedBy ?? [];
		if (!Array.isArray(blockedBy) || blockedBy.some((ref) => !/^[\w.-]+\/[\w.-]+#\d+$/.test(ref))) {
			fail(at, 'blockedBy must be a list like ["PureCutCNC/purecutcnc#795"]');
		}
		summary[entry.status] = (summary[entry.status] ?? 0) + 1;
		if (blockedBy.length) summary.blocked.push(`${key} ← ${blockedBy.join(', ')}`);
		if (args.cutover) {
			if (entry.status !== 'current') fail(at, 'must be current before the cutover');
			if (blockedBy.length) fail(at, `still waiting on ${blockedBy.join(', ')}`);
		}
	}
	return { summary, manifest };
}

function findVisualMarkers(body) {
	const markers = [];
	const pattern = /<VisualPending\s+id=["']([^"']+)["']\s*\/>/g;
	for (const match of body.matchAll(pattern)) {
		markers.push({ id: match[1], line: body.slice(0, match.index).split('\n').length - 1 });
	}
	return markers;
}

function checkMarkerPlacement(where, body, marker, afterHeading) {
	const lines = body.split('\n');
	const headings = lines.flatMap((line, index) => {
		const match = line.match(/^(#{2,6})\s+(.*?)\s*#*\s*$/);
		return match ? [{ line: index, level: match[1].length, text: match[2] }] : [];
	});
	if (afterHeading === '$intro') {
		const firstHeading = headings[0]?.line ?? lines.length;
		if (marker.line >= firstHeading) fail(where, `${marker.id} must appear in the introduction before the first heading`);
		return;
	}
	const heading = headings.find((entry) => entry.text === afterHeading);
	if (!heading) {
		fail(where, `${marker.id} names missing placement heading "${afterHeading}"`);
		return;
	}
	const nextBoundary = headings.find((entry) => entry.line > heading.line && entry.level <= heading.level)?.line ?? lines.length;
	if (marker.line <= heading.line || marker.line >= nextBoundary) {
		fail(where, `${marker.id} must appear after "${afterHeading}" and before the next peer section`);
	}
}

function checkVisualInventory(pageBodies, mediaManifest) {
	const where = 'planning/manual-visual-inventory.json';
	let inventory = {};
	try {
		inventory = JSON.parse(readFileSync(VISUAL_INVENTORY, 'utf8'));
	} catch (error) {
		fail(where, `unreadable: ${error.message}`);
		return { proposed: 0, planned: 0, blocked: 0, captured: 0, notNeeded: 0, proposedNotNeeded: 0 };
	}
	if (inventory.version !== 1) fail(where, 'version must be 1');
	if (!Array.isArray(inventory.pages)) fail(where, 'pages must be an array');
	if (!Array.isArray(inventory.visuals)) fail(where, 'visuals must be an array');

	const pageDecisions = new Map();
	for (const entry of inventory.pages ?? []) {
		const at = `${where} page ${entry.page ?? '(missing)'}`;
		if (!plannedPage(entry.page) || !PAGES.some((page) => page.path === entry.page)) fail(at, 'page is not in the planned User Guide');
		if (pageDecisions.has(entry.page)) fail(at, 'duplicate page decision');
		pageDecisions.set(entry.page, entry);
		if (!['visuals', 'not-needed'].includes(entry.decision)) fail(at, 'decision must be visuals or not-needed');
		if (entry.decision === 'not-needed') {
			if (!['proposed', 'approved'].includes(entry.reviewStatus)) fail(at, 'not-needed reviewStatus must be proposed or approved');
			if (typeof entry.rationale !== 'string' || !entry.rationale.trim()) fail(at, 'not-needed decisions require a rationale');
		}
	}
	for (const page of PAGES) if (!pageDecisions.has(page.path)) fail(where, `${page.path} has no visual decision`);

	const markersByPage = new Map();
	for (const [page, record] of pageBodies) {
		for (const marker of findVisualMarkers(record.body)) {
			markersByPage.set(page, [...(markersByPage.get(page) ?? []), { ...marker, where: record.where, body: record.body }]);
		}
	}

	const ids = new Set();
	const visualById = new Map();
	const assets = new Set();
	const visualsByPage = new Map();
	const summary = { proposed: 0, planned: 0, blocked: 0, captured: 0, notNeeded: 0, proposedNotNeeded: 0 };
	for (const visual of inventory.visuals ?? []) {
		const at = `${where} visual ${visual.id ?? '(missing)'}`;
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(visual.id ?? '')) fail(at, 'id must be stable lowercase kebab case');
		if (ids.has(visual.id)) fail(at, 'duplicate id');
		ids.add(visual.id);
		visualById.set(visual.id, visual);
		if (!PAGES.some((page) => page.path === visual.page)) fail(at, 'page is not in the planned User Guide');
		visualsByPage.set(visual.page, [...(visualsByPage.get(visual.page) ?? []), visual]);
		if (!VISUAL_KINDS.includes(visual.kind)) fail(at, `kind must be one of ${VISUAL_KINDS.join(', ')}`);
		if (!VISUAL_STATUSES.includes(visual.status)) fail(at, `status must be one of ${VISUAL_STATUSES.join(', ')}`);
		for (const field of ['afterHeading', 'purpose', 'brief', 'asset', 'alt']) {
			if (typeof visual[field] !== 'string' || !visual[field].trim()) fail(at, `${field} is required`);
		}
		if (visual.alt?.startsWith('Screenshot of ')) fail(at, 'alt text should describe the useful content without starting with "Screenshot of"');
		const expectedDir = assetDirForPage(visual.page);
		if (path.posix.dirname(visual.asset ?? '') !== expectedDir) fail(at, `asset must be in ${expectedDir}/`);
		if (visual.kind === 'screenshot' && !/\.png$/.test(visual.asset ?? '')) fail(at, 'screenshots use PNG');
		if (visual.kind === 'diagram' && !/\.svg$/.test(visual.asset ?? '')) fail(at, 'diagrams use SVG');
		if (assets.has(visual.asset)) fail(at, `asset ${visual.asset} is assigned to more than one visual`);
		assets.add(visual.asset);
		const blockedBy = visual.blockedBy ?? [];
		if (!Array.isArray(blockedBy) || blockedBy.some((ref) => !/^[\w.-]+\/[\w.-]+#\d+$/.test(ref))) {
			fail(at, 'blockedBy must be a list like ["PureCutCNC/purecutcnc#795"]');
		}
		if (visual.status === 'blocked' && blockedBy.length === 0) fail(at, 'blocked visuals need blockedBy');
		if (visual.status !== 'blocked' && blockedBy.length > 0) fail(at, 'only blocked visuals may have blockedBy');

		const markers = (markersByPage.get(visual.page) ?? []).filter((marker) => marker.id === visual.id);
		if (visual.status === 'captured') {
			if (markers.length) fail(at, 'captured visual must replace its VisualPending marker');
			const assetFile = path.join(MANUAL_ASSETS_DIR, visual.asset);
			if (!existsSync(assetFile)) fail(at, `captured asset ${visual.asset} does not exist`);
			const media = mediaManifest[visual.asset];
			if (!media) fail(at, `captured asset ${visual.asset} has no media.json entry`);
			else {
				if (media.status !== 'current') fail(at, `captured asset ${visual.asset} must be current in media.json`);
				const expectedSource = visual.kind === 'diagram' ? 'diagram' : 'capture';
				if (media.source !== expectedSource) fail(at, `captured ${visual.kind} needs media.json source ${expectedSource}`);
			}
			const used = pageBodies.get(visual.page)?.usedImages ?? [];
			if (!used.includes(visual.asset)) fail(at, `captured asset ${visual.asset} is not imported by ${visual.page}`);
		} else {
			if (markers.length !== 1) fail(at, `needs exactly one VisualPending marker on ${visual.page}; found ${markers.length}`);
			else checkMarkerPlacement(markers[0].where, markers[0].body, markers[0], visual.afterHeading);
			if (args.cutover) fail(at, `${visual.status} visual must be captured before the cutover`);
		}
		summary[visual.status] = (summary[visual.status] ?? 0) + 1;
	}

	for (const [page, markers] of markersByPage) {
		for (const marker of markers) {
			const visual = visualById.get(marker.id);
			if (!visual) fail(marker.where, `VisualPending ${marker.id} is not in the visual inventory`);
			else if (visual.page !== page) fail(marker.where, `VisualPending ${marker.id} belongs on ${visual.page}, not ${page}`);
		}
		if (!pageDecisions.has(page)) fail(markers[0].where, 'page with VisualPending markers has no visual decision');
	}
	for (const [page, decision] of pageDecisions) {
		const count = visualsByPage.get(page)?.length ?? 0;
		if (decision.decision === 'visuals' && count === 0) fail(`${where} page ${page}`, 'visuals decision needs at least one visual');
		if (decision.decision === 'not-needed' && count > 0) fail(`${where} page ${page}`, 'not-needed decision cannot also have visuals');
		if (decision.decision === 'not-needed') {
			summary.notNeeded += 1;
			if (decision.reviewStatus === 'proposed') {
				summary.proposedNotNeeded += 1;
				if (args.cutover) fail(`${where} page ${page}`, 'proposed not-needed decision needs human approval before the cutover');
			}
		}
	}
	return summary;
}

// ── Pages ──────────────────────────────────────────────────────────────────
const pageFiles = listFiles(DOCS_DIR, (name) => /\.mdx?$/.test(name));
const found = new Map();
const pageBodies = new Map();
const usedImages = [];
const statusCount = { draft: 0, reviewed: 0 };
for (const file of pageFiles) {
	const relative = path.relative(DOCS_DIR, file);
	const where = `src/content/docs/${relative.split(path.sep).join('/')}`;
	const pagePath = pagePathForFile(relative);
	const planned = plannedPage(pagePath);
	if (!planned) {
		fail(where, `${pagePath} is not in config/manual-structure.mjs`);
		continue;
	}
	found.set(pagePath, planned);
	const text = readFileSync(file, 'utf8');
	const { data, body, bodyLine } = splitFrontmatter(text, where);
	pageBodies.set(pagePath, { body, where, usedImages: [] });
	checkFrontmatter(where, data, planned);
	checkTerminology(`${where} (frontmatter)`, frontmatterText(data));
	const lines = proseLines(body);
	checkTerminology(where, lines.join('\n'), bodyLine - 1);
	checkHeadings(where, lines, bodyLine, planned.type);
	const pageImages = checkBodyRules(where, lines, bodyLine, file, planned.type === 'utility' ? null : pagePath);
	usedImages.push(...pageImages);
	pageBodies.get(pagePath).usedImages = pageImages.map((image) => path.relative(MANUAL_ASSETS_DIR, image).split(path.sep).join('/'));
	if (planned.type !== 'utility') {
		statusCount[data.status] = (statusCount[data.status] ?? 0) + 1;
		if (args.cutover && data.status !== 'reviewed') fail(where, 'every page must be reviewed before the cutover');
	}
}

if (args.cutover) {
	for (const planned of PAGES) if (!found.has(planned.path)) fail('config/manual-structure.mjs', `${planned.path} has no page yet`);
}

// ── Templates ──────────────────────────────────────────────────────────────
for (const type of PAGE_TYPES.filter((type) => type !== 'utility')) {
	const file = path.join(TEMPLATES_DIR, `${type}.mdx`);
	const where = `templates/${type}.mdx`;
	if (!existsSync(file)) {
		fail(where, 'missing template');
		continue;
	}
	const { data, body, bodyLine } = splitFrontmatter(readFileSync(file, 'utf8'), where);
	if (data.pageType !== type) fail(where, `pageType must be "${type}"`);
	const lines = proseLines(body);
	checkHeadings(where, lines, bodyLine, type);
	checkTerminology(where, lines.join('\n'), bodyLine - 1);
}

const { summary: media, manifest: mediaManifest } = checkManifest(usedImages);
const visuals = checkVisualInventory(pageBodies, mediaManifest);

for (const message of warnings) console.warn(`warning: ${message}`);
if (errors.length) {
	for (const message of errors) console.error(`error: ${message}`);
	console.error(`\n${errors.length} error(s)`);
	process.exit(1);
}

const utility = UTILITY_PAGES.filter((entry) => found.has(entry.path)).length;
console.log(`Pages: ${found.size - utility} of ${PAGES.length} planned exist (${statusCount.draft} draft, ${statusCount.reviewed} reviewed), plus ${utility} utility page(s).`);
console.log(`Screenshots: ${media.current} current, ${media.reshoot} to re-shoot, ${media.blocked.length} waiting on app changes.`);
console.log(`Visual decisions: ${visuals.proposed} proposed, ${visuals.planned} planned, ${visuals.blocked} blocked, ${visuals.captured} captured; ${visuals.notNeeded} not needed (${visuals.proposedNotNeeded} awaiting approval).`);
for (const line of media.blocked) console.log(`  ${line}`);
console.log(warnings.length ? `Checks passed with ${warnings.length} warning(s).` : 'Checks passed.');
