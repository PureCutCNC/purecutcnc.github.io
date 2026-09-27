// Shared by the marketing layout and the Starlight header overrides, so the primary
// navigation is defined once.

export const GITHUB_URL = 'https://github.com/PureCutCNC/purecutcnc';
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const COFFEE_URL = 'https://buymeacoffee.com/purecutcnc';

/** Web app builds, deployed into this site by the app repository. */
export const APP_URL = '/app/';
export const PREVIEW_APP_URL = '/app-rc/';

export interface NavLink {
	label: string;
	href: string;
	/** Path prefix that marks this link as the current section. */
	match?: string;
}

export const PRIMARY_NAV: NavLink[] = [
	{ label: 'Home', href: '/', match: '/' },
	{ label: 'Quick Start', href: '/quickstart/', match: '/quickstart/' },
	{ label: 'User Guide', href: '/guide/', match: '/guide/' },
	{ label: 'Downloads', href: '/downloads/', match: '/downloads/' },
	{ label: "What's New", href: RELEASES_URL },
];

export function isCurrent(link: NavLink, pathname: string): boolean {
	if (!link.match) return false;
	if (link.match === '/') return pathname === '/';
	return pathname.startsWith(link.match);
}
