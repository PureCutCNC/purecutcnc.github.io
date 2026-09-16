# site/ — Astro + Starlight source for purecutcnc.github.io

This directory builds the complete GitHub Pages artifact: the landing and downloads pages,
the Starlight user manual, the legacy-URL redirect pages, and verbatim copies of the
automation-owned `app/`, `app-rc/`, and `downloads/` directories from the repository root.

It is **not deployed yet**. The live site is still the hand-maintained HTML at the
repository root, published by the legacy "Deploy from a branch" Pages source. The switch is
a separate, approved step; see [`planning/SITE_PLATFORM.md`](../planning/SITE_PLATFORM.md).

## Commands

Node 22.12 or newer. From a clean checkout, one command installs and builds:

```sh
npm ci --prefix site && npm run build --prefix site
```

Then, from `site/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. Also serves `/app/`, `/app-rc/`, `/downloads/*.json`, and the legacy redirects. |
| `npm run build` | Writes the full artifact to `site/dist/`. |
| `npm run preview` | Serves `site/dist/` as built. |
| `npm run check` | Type-checks components, pages, and content with `astro check`. |
| `npm run verify` | Checks the built artifact (see below). |
| `npm run verify:cutover` | Same, but unmigrated legacy pages and links to legacy URLs are errors. |
| `npm run ci` | `check`, `build`, then `verify`, as CI runs them. |

Astro 7 may run `dev` and `preview` as background servers when not attached to a terminal;
stop them with `npx astro dev stop` or `npx astro preview stop`.

## What `verify` checks

`scripts/verify-artifact.mjs` resolves URLs the way GitHub Pages does and fails on:

- a missing required route (`/`, `/downloads/`, `/quickstart/`, `/guide/`, `/404.html`,
  `/app/`, `/app-rc/`, every `downloads/*/*.json`, the search index, …);
- any file under `app/`, `app-rc/`, or `downloads/` that is missing from the artifact or
  differs byte-for-byte from the repository copy;
- a legacy URL without its redirect page, or a redirect (or fragment mapping) that points at
  a page or `#id` that does not exist;
- an internal link, image, script, or stylesheet (including `srcset` candidates) that does
  not resolve, or a `#fragment` that has no matching `id` on the target page;
- an empty or unreadable search index file, or a mismatch between the pages marked
  searchable and the pages Pagefind indexed;
- an artifact approaching the 1 GB Pages limit.

`node scripts/verify-artifact.mjs --url https://purecutcnc.github.io` runs the route and
redirect checks against a deployed site; the workflow uses it after each deployment.

## Layout

| Path | Purpose |
| --- | --- |
| `astro.config.mjs` | Site, Starlight, sidebar, and component overrides. |
| `config/generated-content.mjs` | The automation-owned directories and the URLs that must survive. |
| `config/legacy-routes.mjs` | Every published legacy URL and where it now goes. |
| `integrations/site-artifact.mjs` | After the build: repairs an incomplete search index, writes the redirect pages, and copies the generated directories. Dev-server equivalent. |
| `scripts/verify-artifact.mjs` | Artifact and deployed-site checks. |
| `src/content.config.ts` | Manual frontmatter schema (Starlight's plus provisional `pageType` and `reviewed`). |
| `src/content/docs/guide/` | The user manual, served under `/guide/`. |
| `src/content/docs/quickstart.mdx` | The Quick Start, served at `/quickstart/`. |
| `src/pages/` | Landing (`/`) and downloads (`/downloads/`) pages. |
| `src/components/starlight/` | Starlight overrides: header with site navigation, mobile menu, wordmark. |
| `src/components/Screenshot.astro` | Optimized, captioned manual screenshots; fails the build without alt text. |
| `src/components/AppIcon.astro` | Inline icon from the app's own sprite (`app-rc/icons.svg`); fails on unknown names. |
| `src/styles/` | Brand tokens, the Starlight theme mapping, and the marketing page styles. |
| `src/assets/` | Images that the build optimizes. `public/` holds files served as-is. |

## URLs

- Pages use directory URLs with a trailing slash: `/guide/cam-setup/tool-library/`.
- Every URL the old site published keeps working through a static redirect page at the
  exact old path (`/downloads.html`, `/quickstart.html`, `/guide/*.html`). The redirect keeps
  the query string and `#fragment`; `anchors` in `config/legacy-routes.mjs` can send an old
  fragment to a different page, which is how the old single Operations page splits apart.
- When a legacy page is migrated, update its entry: set `to`, add `anchors` for any heading
  ids that changed, and remove `pending`. `npm run verify:cutover` passes only when no entry
  is pending and no page links to a legacy URL.
- `/index.html`, `/guide/index.html`, and `/images/sketch-full-page.png` (the social preview
  image) are served directly.

## Generated directories

`app/`, `app-rc/`, and `downloads/` are written by `PureCutCNC/purecutcnc` workflows. The
build copies them unchanged and refuses to overwrite any of their files. Never edit them to
fix a site problem. Because they are part of the artifact, a new web app build or new release
metadata goes live only when the site is rebuilt and deployed; the automated push to `main`
starts that run. The downloads page reads `/downloads/{stable,snapshot}/{platform}.json` at
runtime, so its cards need no page change.
