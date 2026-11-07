# AGENTS.md — how to update this site

This repo is the **public website for PureCut CNC**, `https://purecutcnc.github.io`.
Since the cutover on 2026-09-27 the live site is the **Astro + Starlight project
in `site/`**: every push to `main` runs `.github/workflows/site.yml`, which builds
`site/` into one artifact (landing, downloads, Quick Start, User Guide, legacy
redirects, plus the automation-owned `app/`, `app-rc/`, `downloads/`) and
deploys it to GitHub Pages. See `site/README.md` and `planning/SITE_PLATFORM.md`.

The old hand-written HTML at the repository root (`index.html`,
`quickstart.html`, `downloads.html`, `guide/`, `images/`) is **no longer
served**. It stays only so the rollback in `planning/SITE_PLATFORM.md` can
restore it; don't edit it.

Read this before editing. Most update mistakes come from not knowing which files
are hand-maintained and which are written by automation.

## Golden rules

1. **Sync before you edit.** This repo receives automated commits from CI, so a
   local checkout is frequently many commits behind. Always
   `git fetch origin && git checkout main && git pull --ff-only` first. Editing a
   stale tree causes conflicts and re-does work CI already did.
2. **Never hand-edit generated files** (see the map below). CI overwrites them on
   the next release/deploy, so your changes would be lost *and* can conflict.
3. **Branch + PR. Never commit directly to `main`.** Every merge to `main`
   deploys the site. Create a branch, open a PR, and let it merge.
4. **Manual changes for an unreleased app version wait for that release.** Keep
   them in draft PRs and merge them with the release, so the live guide always
   matches the app people can download.
5. **No `Co-Authored-By` lines and no "Generated with…" footer** in commits or PR
   descriptions.
6. **Verify locally** before opening the PR (see *Local preview*).

## Repo map — who owns what

| Path | Owner | Notes |
|------|-------|-------|
| `site/src/pages/index.astro`, `site/src/data/landing.ts` | **You (manual)** | Landing page markup and its feature, strategy, and operation copy. Images in `site/src/assets/landing/`. |
| `site/src/pages/downloads.astro` | **You (manual)** | Downloads page shell + JS. The versions it shows come from JSON — see below. |
| `site/src/content/docs/quickstart.mdx` | **You (manual)** | Quick Start, at `/quickstart/`. |
| `site/src/content/docs/guide/` | **You (manual)** | The User Guide, at `/guide/`. Page tree in `site/config/manual-structure.mjs`; screenshots in `site/src/assets/manual/`. |
| `site/` (rest) | **You (manual)** | Astro config, components, checks, and the capture script. See `site/README.md`. |
| `site/public/images/`, `site/public/guide/` | **Frozen** | Copies of the old site's image URLs. Refreshed only by `npm run legacy:sync`. |
| `downloads/stable/*.json` | **CI (auto)** | Written by the app repo's `deploy-{linux,macos,windows}.yml` on release publish. |
| `downloads/snapshot/*.json` | **CI (auto)** | Written by the app repo's RC deploy on main-branch pushes. |
| `app/` | **CI (auto)** | The **deployed stable web app** build (`deploy.yml` copies `dist/` here). Includes its own `app/icons.svg`, `app/favicon.svg`. Do **not** touch. |
| `app-rc/` | **CI (auto)** | The **deployed preview build** (`deploy-rc.yml`). The site reads its icons from `app-rc/icons.svg`. Do **not** touch. |
| `.github/workflows/site.yml` | **You (manual)** | Builds, verifies, and deploys `site/`, then smoke-tests the live site. |
| `planning/` | **You (manual)** | Decision records, runbooks, manual coverage and visual inventory. |
| `index.html`, `quickstart.html`, `downloads.html`, `guide/`, `images/`, `favicon.svg` | **Legacy** | The pre-cutover site, kept for rollback only. Not served; don't edit. |
| `.nojekyll` | **You (manual)** | Keeps a rollback branch build from running Jekyll (which dropped `_`-prefixed app files). |

The automation lives in the **app repo** (`PureCutCNC/purecutcnc`) under
`.github/workflows/deploy*.yml`; those jobs check out this repo and push commits
here as `github-actions[bot]` (e.g. `deploy: update app from release vX`,
`downloads: update … stable metadata for vX`). Each of those pushes to `main`
starts `site.yml`, which rebuilds and redeploys the site, so a new app build
goes live only through that run. Pull requests are built and verified, with a
`site-preview` artifact, but not deployed.

## How the moving parts work

### Download cards (`/downloads/`)
`site/src/pages/downloads.astro` fetches `downloads/{channel}/{platform}.json` at
runtime and renders a card per platform/track. Those JSON files carry the
version, tag, release URL, and asset links, and are **updated automatically**
when a release is published — you normally do nothing. (The GitHub API
`releases/latest` is only used for the "latest stable" link and the empty-state
fallback message.)

### Hero version badge (`/`)
In `site/src/pages/index.astro`, `<span id="js-hero-version">` is **empty and
`hidden` in the markup**. JS fills it in at runtime from the GitHub API's
`releases/latest` and unhides it, so the badge self-updates once a release is
published. **Never hardcode a version there** — a static fallback only goes
stale and contradicts the live value. If the API call fails or is rate-limited
the span stays hidden and the badge degrades to just the feature list.

The rest of the badge (`Sheet nesting · CAM Plan · …`) *is* hand-written —
refresh those feature words on a release so they headline what's actually new.

### Icons
Guide pages use `<AppIcon name="…" />`, which inlines the symbol from
`app-rc/icons.svg` at build time. That file is the deployed preview build's copy
of the app repo's `public/icons.svg`, so there is nothing to sync by hand. A
missing icon fails the build.

## Playbook — when a new version ships

1. **Sync** this repo (`git pull --ff-only` on `main`), then branch.
2. **Confirm CI already ran** (usually within minutes of publishing the release):
   `downloads/stable/*.json` should read the new `"version"`, and there should be a
   `deploy: update app from release vX` commit whose `Site` run deployed. If not,
   wait for CI rather than editing those files by hand.
3. **Refresh the hero badge tagline** in `site/src/pages/index.astro` so it
   headlines the new release's features. Leave the version alone — it's
   injected at runtime (see *Hero version badge*).
4. **Refresh feature copy** in `site/src/data/landing.ts` for anything new or
   changed. Pull the change list from the GitHub release notes:
   `gh release view vX --repo PureCutCNC/purecutcnc`. Fix anything now
   inaccurate (e.g. a renamed/removed operation).
5. **Merge the release's manual PRs** (held as drafts until now, see rule 4).
   Before merging, turn preview availability notices for features that are now
   stable into stable text, and re-run `npm run content:cutover` and
   `npm run verify:cutover` in `site/`.
6. **Verify locally**, then open or merge the PR. Watch the `Site` run on `main`
   through `deploy` and `smoke-test`.

## Playbook — adding or updating a guide page

- Pages are MDX under `site/src/content/docs/guide/`; the next section covers
  how to write them.
- Use `<AppIcon />` for app icons and `<Screenshot />` / `<VisualPending />`
  for visuals; never link to `guide/*.html` or the old `images/` paths.

## Working on the site (`site/`)

- Branch from `main` and open PRs against `main`. A manual update for an
  unreleased app version may be a stack of draft PRs, each based on the one
  before; retarget them to `main` in order when the release ships.
- Setup and commands are in `site/README.md`: `npm ci --prefix site`, then
  `npm run ci` inside `site/`.
- Before writing a User Guide page, read `planning/MANUAL_BLUEPRINT.md`. Every
  page is already listed, with its title, type, and owning workstream, in
  `site/config/manual-structure.mjs`; start from `site/templates/<type>.mdx` and
  run `npm run content`. Don't add pages or sections outside that file.
- Old URLs (`/guide/*.html`, `/downloads.html`, `/quickstart.html`) redirect
  through `site/config/legacy-routes.mjs`. If a page moves or a heading id
  changes, update its entry and `anchors` in the same PR.
- `planning/manual-coverage.csv` lists every capability the manual must cover
  and which page and workstream own it. Update its rows when your page lands
  (see `planning/MANUAL_COVERAGE.md`); `npm run coverage` checks it.
- The site copies `app/`, `app-rc/`, and `downloads/` from the root at build
  time and reads icons from `app-rc/icons.svg`, so it needs no hand-synced copies.
- The old `images/` and `guide/screenshots/` URLs are served from frozen copies
  in `site/public/`. Don't edit them; new images go in `site/src/assets/`.

### Tracking issues

Every manual workstream has a GitHub issue that owns it: #29 W1 Foundations,
#30 W2 Design and import, #31 W3 CAM setup and 2.5D operations, #32 W4 3D
operations and strategies, #33 W5 Verify, export and reference, under the #28
Wave 2 tracker and the #24 initiative. Visual coverage is #47.

- **Read your issue before starting.** It holds the page list, the acceptance
  criteria, and the contracts with other workstreams — shared files, anchors
  another workstream links to, and who owns which redirect entry.
- **Don't trust its status.** Issue checklists go stale; the checks do not. Get
  the real state from `npm run content`, `npm run coverage`, and
  `node scripts/check-coverage.mjs --where workstream=W3`. Where an issue and
  the checks disagree, the checks are right.
- **Comment on the issue when work lands**, with what is now true and what is
  left. This is the step that keeps being skipped: in Wave 2 all five
  workstreams merged their pages and none updated its issue, so the next
  session had to re-derive the state from the repo.
- **Merging the prose is not finishing.** A workstream is done when its pages
  are `status: reviewed`, its `manual-coverage.csv` rows are `accurate`, and
  its visuals are captured — that is, when `npm run content:cutover` and
  `npm run verify:cutover` pass for its pages. `npm run ci` passes long before
  that, so it cannot tell you a workstream is complete.
- **File app defects in `PureCutCNC/purecutcnc`**, not here, and list the issue
  in `blockedBy` for any screenshot it affects.

### Screenshots

`npm run capture` (`site/scripts/capture-visuals.mjs`) replays each screenshot
from a recipe — fixture project, viewport, panel sizes, interaction, crop — so a
re-shoot after an app change is one command instead of a remembered sequence.
Add a recipe per visual rather than capturing by hand; `--only id,id` re-runs a
subset. Recipes are validated against `planning/manual-visual-inventory.json`
and abort on drift.

## Local preview & verification

The site is the Astro project in `site/` (`npm ci --prefix site` once). From
`site/`:

```
npm run dev
```

Then open `http://localhost:4321/` (Astro's default port). The dev server also
serves `/app/`, `/app-rc/`, `/downloads/*.json`, and the legacy redirects.

To check what CI publishes, build and serve the artifact instead:

```
npm run build
npm run preview
```

`npm run ci` is the gate CI runs (`check`, `content`, `coverage`, `build`,
`verify`); it must pass before a PR. Stop a background server with
`npx astro dev stop` or `npx astro preview stop`.

Look at:
- **`/`** — the landing page; the hero shows the latest release version (read
  from the GitHub API, so it is blank offline) and new or changed features are
  described.
- **`/downloads/`** — each Stable card shows the new version with working asset
  links (read from `downloads/{channel}/{platform}.json`).
- **`/quickstart/`** and the **User Guide** pages you changed (`/guide/…`) —
  text, screenshots, and app icons render, the sidebar lists the page, and the
  browser console is clean. Search only works in `npm run preview`, since the
  index is built with the site. App icons come from
  `app-rc/icons.svg`; a missing icon fails the build rather than 404ing.
- a **legacy URL** you touched (an old `guide/*.html` page) redirects to its new
  page.

Then: branch → stage → commit (no co-author, no attribution footer) → PR.
