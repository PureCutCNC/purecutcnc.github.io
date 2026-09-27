#!/usr/bin/env node
// Copies the hand-maintained site's images (see config/legacy-assets.mjs) into
// site/public/ at their published paths and records them in config/legacy-assets.json.
//
// Run it after merging main into site-revamp whenever those images changed on main; the
// verify script warns when they have. Files are added or updated, never removed: a URL
// that was published stays published, even after the root copy is deleted.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from '../config/generated-content.mjs';
import {
	LEGACY_ASSET_MANIFEST,
	LEGACY_ASSET_SOURCES,
	readLegacyAssetManifest,
} from '../config/legacy-assets.mjs';

const repoRoot = fileURLToPath(REPO_ROOT);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

async function filesUnder(relative) {
	const absolute = path.join(repoRoot, relative);
	const info = await stat(absolute).catch(() => null);
	if (!info) return [];
	if (info.isFile()) return [relative];
	const entries = await readdir(absolute, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
		.map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)));
}

const manifest = await readLegacyAssetManifest();
const counts = { added: 0, updated: 0, unchanged: 0 };

for (const source of LEGACY_ASSET_SOURCES) {
	const files = await filesUnder(source);
	if (files.length === 0) {
		console.log(`skipped ${source}: not in the repository root`);
		continue;
	}
	for (const relative of files) {
		const sitePath = `/${relative.split(path.sep).join('/')}`;
		const bytes = await readFile(path.join(repoRoot, relative));
		const hash = createHash('sha256').update(bytes).digest('hex');
		if (manifest[sitePath] === hash) {
			counts.unchanged += 1;
			continue;
		}
		counts[manifest[sitePath] ? 'updated' : 'added'] += 1;
		const target = path.join(publicDir, relative);
		await mkdir(path.dirname(target), { recursive: true });
		await copyFile(path.join(repoRoot, relative), target);
		manifest[sitePath] = hash;
	}
}

const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(LEGACY_ASSET_MANIFEST, `${JSON.stringify({ files: sorted }, null, '\t')}\n`);
console.log(
	`Legacy images: ${counts.added} added, ${counts.updated} updated, ${counts.unchanged} unchanged` +
		` (${Object.keys(sorted).length} tracked).`
);
