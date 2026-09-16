#!/usr/bin/env node
// Verifies the built GitHub Pages artifact in site/dist, or the same routes on a
// deployed site.
//
//   node scripts/verify-artifact.mjs              check site/dist
//   node scripts/verify-artifact.mjs --cutover    also fail on unmigrated legacy pages
//                                                 and on links that still use legacy URLs
//   node scripts/verify-artifact.mjs --url https://purecutcnc.github.io
//                                                 check required routes over HTTP
//
// Local checks follow GitHub Pages resolution: `/dir/` serves `dir/index.html`, `/page`
// serves `page.html` or redirects to `/page/`, and anything else is a 404.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { GENERATED_DIRS, REPO_ROOT, REQUIRED_GENERATED_URLS } from '../config/generated-content.mjs';
import { LEGACY_ROUTES } from '../config/legacy-routes.mjs';

const { values: args } = parseArgs({
	options: {
		cutover: { type: 'boolean', default: false },
		url: { type: 'string' },
		dist: { type: 'string', default: fileURLToPath(new URL('../dist/', import.meta.url)) },
	},
});

const SITE_ORIGIN = 'https://purecutcnc.github.io';

/** Pages and files every artifact must serve, besides the generated directories. */
const REQUIRED_URLS = [
	'/',
	'/index.html',
	'/downloads/',
	'/quickstart/',
	'/guide/',
	'/guide/index.html',
	'/404.html',
	'/favicon.svg',
	'/images/sketch-full-page.png',
	'/pagefind/pagefind.js',
	'/sitemap-index.xml',
	...REQUIRED_GENERATED_URLS,
];

/** Directories whose HTML is not ours to lint (copied verbatim from automation). */
const UNSCANNED_PREFIXES = ['app/', 'app-rc/', 'pagefind/'];

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

async function isFile(file) {
	return (await stat(file).catch(() => null))?.isFile() ?? false;
}

async function listFiles(dir) {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true });
	return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

async function sha256(file) {
	return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Resolve a site path to a file in the artifact the way GitHub Pages would. */
async function resolvePath(dist, pathname) {
	const decoded = decodeURIComponent(pathname);
	const file = path.join(dist, decoded);
	if (!file.startsWith(dist)) return null;
	if (decoded.endsWith('/')) return (await isFile(path.join(file, 'index.html'))) ? path.join(file, 'index.html') : null;
	if (await isFile(file)) return file;
	if (await isFile(`${file}.html`)) return `${file}.html`;
	if (await isFile(path.join(file, 'index.html'))) return path.join(file, 'index.html');
	return null;
}

const idCache = new Map();
async function idsIn(file) {
	if (!idCache.has(file)) {
		const html = await readFile(file, 'utf8');
		idCache.set(file, new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1])));
	}
	return idCache.get(file);
}

/** Legacy redirect pages in the artifact, keyed by file path. */
const redirectPages = new Map();

/**
 * Check that `/path/#fragment` points at a page (and element) in the artifact. A link to
 * a legacy redirect page is followed to where that page sends the fragment.
 */
async function checkTarget(dist, target, context) {
	const url = new URL(target, SITE_ORIGIN);
	const file = await resolvePath(dist, url.pathname);
	if (!file) {
		fail(`${context}: ${target} does not exist in the artifact`);
		return null;
	}
	const fragment = decodeURIComponent(url.hash.slice(1));
	const route = redirectPages.get(file);
	if (route) {
		const destination = route.anchors?.[fragment] ?? route.to + url.hash;
		if (route.pending && !route.anchors?.[fragment]) return file;
		await checkTarget(dist, destination, `${context} (via ${route.from})`);
		return file;
	}
	if (fragment && file.endsWith('.html') && !(await idsIn(file)).has(fragment)) {
		fail(`${context}: ${target} has no element with id "${fragment}"`);
	}
	return file;
}

async function checkRequired(dist) {
	for (const url of REQUIRED_URLS) {
		if (!(await resolvePath(dist, url))) fail(`Required URL ${url} is missing`);
	}
}

async function checkGeneratedCopies(dist) {
	const repoRoot = fileURLToPath(REPO_ROOT);
	let count = 0;
	for (const name of GENERATED_DIRS) {
		const source = path.join(repoRoot, name);
		for (const file of await listFiles(source)) {
			const relative = path.relative(repoRoot, file);
			const copy = path.join(dist, relative);
			if (!(await isFile(copy))) fail(`Generated file ${relative} is missing from the artifact`);
			else if ((await sha256(file)) !== (await sha256(copy))) fail(`Generated file ${relative} differs from the repository copy`);
			count += 1;
		}
	}
	return count;
}

async function checkLegacyRoutes(dist) {
	for (const route of LEGACY_ROUTES) {
		const file = path.join(dist, route.from);
		if (await isFile(file)) redirectPages.set(file, route);
	}
	for (const route of LEGACY_ROUTES) {
		const context = `Legacy URL ${route.from}`;
		const file = path.join(dist, route.from);
		if (!redirectPages.has(file)) {
			fail(`${context} has no redirect page`);
			continue;
		}
		const html = await readFile(file, 'utf8');
		if (!html.includes(`url=${route.to}"`)) fail(`${context} does not redirect to ${route.to}`);
		await checkTarget(dist, route.to, context);
		for (const [fragment, target] of Object.entries(route.anchors ?? {})) {
			await checkTarget(dist, target, `${context}#${fragment}`);
		}
		if (route.pending) {
			(args.cutover ? fail : warn)(`${context} is not migrated yet (placeholder target ${route.to})`);
		}
	}
}

function urlsIn(html, { skipCanonical }) {
	// Script and style bodies can contain attribute-like text (template strings).
	let markup = html.replace(/(<(script|style)\b[^>]*>)[\s\S]*?<\/\2>/g, '$1</$2>');
	// The 404 page is served for every missing URL, so its canonical URL is not a page.
	if (skipCanonical) markup = markup.replace(/<link rel="canonical"[^>]*>/g, '');
	const urls = [];
	for (const match of markup.matchAll(/\s(href|src|srcset)="([^"]*)"/g)) {
		const [, attribute, value] = match;
		if (attribute === 'srcset') {
			for (const candidate of value.split(',')) urls.push(candidate.trim().split(/\s+/)[0]);
		} else {
			urls.push(value);
		}
	}
	return urls.filter(Boolean);
}

async function checkLinks(dist) {
	const pages = (await listFiles(dist)).filter((file) => {
		const relative = path.relative(dist, file).split(path.sep).join('/');
		return (
			file.endsWith('.html') &&
			!redirectPages.has(file) &&
			!UNSCANNED_PREFIXES.some((prefix) => relative.startsWith(prefix))
		);
	});
	let checked = 0;
	for (const page of pages) {
		const relative = path.relative(dist, page);
		const pageUrl = new URL(`/${relative.split(path.sep).join('/').replace(/(^|\/)index\.html$/, '$1')}`, SITE_ORIGIN);
		const html = await readFile(page, 'utf8');
		for (const raw of urlsIn(html, { skipCanonical: relative === '404.html' })) {
			let url;
			try {
				url = new URL(raw.replaceAll('&amp;', '&'), pageUrl);
			} catch {
				fail(`${relative}: malformed URL ${raw}`);
				continue;
			}
			if (url.origin !== SITE_ORIGIN) continue;
			checked += 1;
			const context = `${relative} links to ${raw}`;
			const target = await checkTarget(dist, url.pathname + url.hash, context);
			if (target && redirectPages.has(target)) {
				(args.cutover ? fail : warn)(`${context}, a legacy redirect; link to the new page instead`);
			}
		}
	}
	return { pages: pages.length, checked };
}

async function checkSearchIndex(dist) {
	const entry = path.join(dist, 'pagefind', 'pagefind-entry.json');
	if (!(await isFile(entry))) {
		fail('Pagefind index is missing');
		return 0;
	}
	for (const file of await listFiles(path.dirname(entry))) {
		if ((await stat(file)).size === 0) fail(`Search index file ${path.relative(dist, file)} is empty`);
	}
	let languages;
	try {
		({ languages } = JSON.parse(await readFile(entry, 'utf8')));
	} catch (error) {
		fail(`Pagefind entry file is unreadable: ${error.message}`);
		return 0;
	}
	const indexed = Object.values(languages).reduce((sum, language) => sum + language.page_count, 0);
	let searchable = 0;
	for (const file of await listFiles(dist)) {
		if (file.endsWith('.html') && (await readFile(file, 'utf8')).includes('data-pagefind-body')) searchable += 1;
	}
	if (searchable === 0) fail('No manual page is marked for search indexing');
	if (indexed !== searchable) fail(`Pagefind indexed ${indexed} page(s) but ${searchable} are marked searchable`);
	return indexed;
}

async function directorySize(dir) {
	let bytes = 0;
	for (const file of await listFiles(dir)) bytes += (await stat(file)).size;
	return bytes;
}

async function verifyLocal() {
	const dist = path.resolve(args.dist) + path.sep;
	if (!(await stat(dist).catch(() => null))?.isDirectory()) {
		console.error(`No artifact at ${dist}. Run \`npm run build\` first.`);
		process.exit(1);
	}
	await checkRequired(dist);
	const generated = await checkGeneratedCopies(dist);
	await checkLegacyRoutes(dist);
	const links = await checkLinks(dist);
	const indexed = await checkSearchIndex(dist);
	const megabytes = (await directorySize(dist)) / 1024 / 1024;
	if (megabytes > 900) fail(`Artifact is ${megabytes.toFixed(0)} MB; GitHub Pages sites are limited to 1 GB`);

	console.log(`Artifact: ${dist} (${megabytes.toFixed(1)} MB)`);
	console.log(`  required URLs      ${REQUIRED_URLS.length}`);
	console.log(`  generated files    ${generated} byte-identical copies of ${GENERATED_DIRS.join('/, ')}/`);
	console.log(`  legacy redirects   ${redirectPages.size} (${LEGACY_ROUTES.filter((route) => route.pending).length} pending)`);
	console.log(`  internal links     ${links.checked} in ${links.pages} pages`);
	console.log(`  search index       ${indexed} pages`);
}

async function verifyRemote(base) {
	const check = async (pathname, expect) => {
		const url = new URL(pathname, base);
		const response = await fetch(url, { redirect: 'follow' });
		if (!response.ok) {
			fail(`${url} returned HTTP ${response.status}`);
			return;
		}
		if (expect && !(await response.text()).includes(expect)) fail(`${url} does not contain ${expect}`);
	};
	await Promise.all(REQUIRED_URLS.map((pathname) => check(pathname)));
	await Promise.all(LEGACY_ROUTES.map((route) => check(route.from, `url=${route.to}"`)));
	const missing = await fetch(new URL('/this-page-does-not-exist/', base));
	if (missing.status !== 404) fail(`Unknown pages return HTTP ${missing.status} instead of 404`);
	console.log(`Checked ${REQUIRED_URLS.length + LEGACY_ROUTES.length + 1} URLs on ${base}`);
}

if (args.url) await verifyRemote(args.url);
else await verifyLocal();

for (const message of warnings) console.warn(`warning: ${message}`);
for (const message of errors) console.error(`error: ${message}`);
if (errors.length) {
	console.error(`\n${errors.length} error(s)`);
	process.exit(1);
}
console.log(warnings.length ? `\nPassed with ${warnings.length} warning(s)` : '\nPassed');
