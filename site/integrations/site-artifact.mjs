// Astro integration that turns the Astro build into the complete GitHub Pages artifact:
//
//  1. checks the search index Starlight just wrote, and rebuilds it if it is incomplete;
//  2. writes a static redirect page for every legacy URL in config/legacy-routes.mjs;
//  3. copies the automation-owned directories (app/, app-rc/, downloads/) from the
//     repository root into the output, byte-for-byte.
//
// All steps run in `astro:build:done`, after Starlight has built the Pagefind index, so
// neither the redirect pages nor the web app bundles are indexed for search. The dev
// server gets the same behaviour through a middleware, so `astro dev` can exercise the
// download cards and the web app links without a separate static server.
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { GENERATED_DIRS, REPO_ROOT } from '../config/generated-content.mjs';
import { LEGACY_ROUTES } from '../config/legacy-routes.mjs';

const CONTENT_TYPES = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
	'.webmanifest': 'application/manifest+json',
	'.woff2': 'font/woff2',
};

/** JSON that is safe to inline inside a <script> element. */
function inlineJson(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Static redirect page for one legacy URL. JavaScript preserves the query string and
 * fragment (and applies the fragment map); the meta refresh covers clients without it.
 */
export function renderRedirectPage({ to, anchors = {} }, site) {
	const canonical = new URL(to, site).href;
	const script = `(function(){var a=${inlineJson(anchors)};var h=location.hash.slice(1);try{h=decodeURIComponent(h)}catch(e){}var t=Object.prototype.hasOwnProperty.call(a,h)?a[h]:${inlineJson(to)}+location.hash;var i=t.indexOf('#');location.replace((i<0?t:t.slice(0,i))+location.search+(i<0?'':t.slice(i)))})();`;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Page moved | PureCutCNC</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${escapeHtml(canonical)}">
<script>${script}</script>
<meta http-equiv="refresh" content="0; url=${escapeHtml(to)}">
</head>
<body>
<p>This page has moved to <a href="${escapeHtml(to)}">${escapeHtml(canonical)}</a>.</p>
</body>
</html>
`;
}

async function exists(file) {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
}

async function listFiles(dir) {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true });
	return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Starlight writes the index through Pagefind's Node API, which stops the indexer as soon as
 * the write call returns. One spike build (a first build after a fresh install) ended up
 * with empty index files. If that happens, rebuild the index with the Pagefind CLI, which
 * runs to completion.
 */
export async function ensureSearchIndex(outDir, logger) {
	const indexDir = path.join(outDir, 'pagefind');
	const files = (await exists(indexDir)) ? await listFiles(indexDir) : [];
	let empty = 0;
	for (const file of files) if ((await stat(file)).size === 0) empty += 1;
	if (files.length > 0 && empty === 0) return;
	logger.warn(`Search index is incomplete (${empty} of ${files.length} files empty); rebuilding it.`);
	await rm(indexDir, { recursive: true, force: true });
	const cli = fileURLToPath(new URL('./runner/bin.cjs', import.meta.resolve('pagefind')));
	await promisify(execFile)(process.execPath, [cli, '--site', outDir]);
}

async function writeLegacyRedirects(outDir, site, logger) {
	for (const route of LEGACY_ROUTES) {
		const file = path.join(outDir, route.from);
		if (await exists(file)) {
			throw new Error(`Legacy redirect ${route.from} would overwrite a built page. Remove it from config/legacy-routes.mjs.`);
		}
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, renderRedirectPage(route, site));
	}
	const pending = LEGACY_ROUTES.filter((route) => route.pending).length;
	logger.info(`Wrote ${LEGACY_ROUTES.length} legacy redirect pages (${pending} still pending migration).`);
}

async function copyGeneratedDirs(outDir, logger) {
	const repoRoot = fileURLToPath(REPO_ROOT);
	for (const name of GENERATED_DIRS) {
		const source = path.join(repoRoot, name);
		if (!(await exists(source))) {
			throw new Error(`Generated directory ${name}/ is missing from the repository root.`);
		}
		const target = path.join(outDir, name);
		for (const file of await listFiles(source)) {
			const relative = path.relative(source, file);
			if (await exists(path.join(target, relative))) {
				throw new Error(`The site build also produced ${name}/${relative}; generated files must not be shadowed.`);
			}
		}
		// The per-file check above already rules out overwrites; directories may merge
		// (the downloads page itself is built at downloads/index.html).
		await cp(source, target, { recursive: true, force: false });
		logger.info(`Copied ${name}/ from the repository root.`);
	}
}

/** Dev-server equivalent of the build output for generated directories and redirects. */
function devMiddleware(site) {
	const repoRoot = fileURLToPath(REPO_ROOT);
	const redirects = new Map(LEGACY_ROUTES.map((route) => [route.from, route]));
	return async (req, res, next) => {
		const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
		const redirect = redirects.get(pathname);
		if (redirect) {
			res.setHeader('Content-Type', CONTENT_TYPES['.html']);
			res.end(renderRedirectPage(redirect, site));
			return;
		}
		const [, top] = pathname.split('/');
		if (!GENERATED_DIRS.includes(top)) return next();
		let file = path.join(repoRoot, path.normalize(pathname));
		if (!file.startsWith(path.join(repoRoot, top) + path.sep)) return next();
		if (pathname.endsWith('/')) file = path.join(file, 'index.html');
		const info = await stat(file).catch(() => null);
		if (!info?.isFile()) return next();
		res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream');
		res.setHeader('Cache-Control', 'no-store');
		createReadStream(file).pipe(res);
	};
}

export default function siteArtifact() {
	let site = 'https://purecutcnc.github.io';
	return {
		name: 'purecutcnc:site-artifact',
		hooks: {
			'astro:config:done': ({ config }) => {
				if (config.site) site = config.site;
			},
			'astro:server:setup': ({ server }) => {
				server.middlewares.use(devMiddleware(site));
			},
			'astro:build:done': async ({ dir, logger }) => {
				const outDir = fileURLToPath(dir);
				await ensureSearchIndex(outDir, logger);
				await writeLegacyRedirects(outDir, site, logger);
				await copyGeneratedDirs(outDir, logger);
			},
		},
	};
}
