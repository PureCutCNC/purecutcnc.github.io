// Directories that PureCutCNC/purecutcnc automation commits to the root of this
// repository. They are copied into the built artifact byte-for-byte at their existing
// URLs; the site build never modifies, renames, or filters them.
//
//   app/        stable web app          (purecutcnc deploy.yml, on release publish)
//   app-rc/     preview web app         (purecutcnc deploy-rc.yml, on push to main)
//   downloads/  desktop release JSON    (purecutcnc deploy-{linux,macos,windows}.yml)
export const GENERATED_DIRS = ['app', 'app-rc', 'downloads'];

/** Repository root (the parent of `site/`), where the generated directories live. */
export const REPO_ROOT = new URL('../../', import.meta.url);

/**
 * URLs that must resolve in every artifact because the desktop/web app, release
 * tooling, or external links depend on them. The verify script requests each one.
 */
export const REQUIRED_GENERATED_URLS = [
	'/app/',
	'/app/version.json',
	'/app-rc/',
	'/downloads/stable/linux.json',
	'/downloads/stable/macos.json',
	'/downloads/stable/windows.json',
	'/downloads/snapshot/linux.json',
	'/downloads/snapshot/macos.json',
	'/downloads/snapshot/windows.json',
];
