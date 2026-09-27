// Image URLs published by the hand-maintained site. They keep working after the cutover
// as frozen copies in site/public/ at the same paths, listed with their SHA-256 in
// legacy-assets.json. `npm run legacy:sync` refreshes both from the repository root, and
// the verify script checks the artifact against the manifest.
//
// The copies are never edited by hand. New manual images go in site/src/assets/.
import { readFile } from 'node:fs/promises';

/** Paths under the repository root, relative, as files or directories. */
export const LEGACY_ASSET_SOURCES = ['images', 'guide/screenshots', 'guide/icons.svg', 'guide/favicon.svg'];

export const LEGACY_ASSET_MANIFEST = new URL('./legacy-assets.json', import.meta.url);

/** @returns {Promise<Record<string, string>>} site path → SHA-256 */
export async function readLegacyAssetManifest() {
	try {
		return JSON.parse(await readFile(LEGACY_ASSET_MANIFEST, 'utf8')).files;
	} catch (error) {
		if (error.code === 'ENOENT') return {};
		throw error;
	}
}
