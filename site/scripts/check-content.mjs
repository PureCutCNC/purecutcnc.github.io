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
	[/\bPureCutCNC\b|\bPure Cut\b|\bPurecut\b/, 'write "PureCut CNC" (bold UI text may keep the app spelling)'],
	[/\buser manual\b/i, 'the guide is called the "User Guide"'],
	[/\bpreview build\b/, 'write "Preview Build"'],
	[/\bclick on\b/i, 'write "click"'],
	[/\be\.g\.|\bi\.e\./, 'write "for example" or "that is"'],
];

const MEDIA_EXTENSIONS = /\.(png|jpe?g|webp|svg)$/i;
const MEDIA_SOURCES = ['capture', 'legacy-guide', 'diagram'];
const MEDIA_STATUSES = ['current', 'reshoot'];

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
	if (/^\s*(import|export)\s/.test(line)) return '';
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
			if (!/^[0-9a-f]{40}$/.test(entry.appCommit ?? '')) fail(at, 'a capture needs appCommit (full SHA)');
			if (!/^\d+x\d+@\d(\.\d+)?x$/.test(entry.viewport ?? '')) fail(at, 'a capture needs viewport like 1440x900@2x');
			if (typeof entry.fixture !== 'string' || !entry.fixture) fail(at, 'a capture needs the fixture it was taken from');
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
	return summary;
}

// ── Pages ──────────────────────────────────────────────────────────────────
const pageFiles = listFiles(DOCS_DIR, (name) => /\.mdx?$/.test(name));
const found = new Map();
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
	checkFrontmatter(where, data, planned);
	checkTerminology(`${where} (frontmatter)`, frontmatterText(data));
	const lines = proseLines(body);
	checkTerminology(where, lines.join('\n'), bodyLine - 1);
	checkHeadings(where, lines, bodyLine, planned.type);
	usedImages.push(...checkBodyRules(where, lines, bodyLine, file, planned.type === 'utility' ? null : pagePath));
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

const media = checkManifest(usedImages);

for (const message of warnings) console.warn(`warning: ${message}`);
if (errors.length) {
	for (const message of errors) console.error(`error: ${message}`);
	console.error(`\n${errors.length} error(s)`);
	process.exit(1);
}

const utility = UTILITY_PAGES.filter((entry) => found.has(entry.path)).length;
console.log(`Pages: ${found.size - utility} of ${PAGES.length} planned exist (${statusCount.draft} draft, ${statusCount.reviewed} reviewed), plus ${utility} utility page(s).`);
console.log(`Screenshots: ${media.current} current, ${media.reshoot} to re-shoot, ${media.blocked.length} waiting on app changes.`);
for (const line of media.blocked) console.log(`  ${line}`);
console.log(warnings.length ? `Checks passed with ${warnings.length} warning(s).` : 'Checks passed.');
