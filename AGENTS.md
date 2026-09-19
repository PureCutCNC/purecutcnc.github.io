# AGENTS.md — how to update this site

This repo is the **public website for PureCut CNC**, served as a static site at
`https://purecutcnc.github.io` via GitHub Pages (the `main` branch is the live
site). The live site is plain HTML/CSS/JS at the repository root — there is **no
build step** for it.

A generated replacement (Astro + Starlight, with the new user manual) is being
built in `site/`. It is **not deployed yet**: GitHub Pages still publishes the
root files. See `site/README.md` and `planning/SITE_PLATFORM.md`.

Read this before editing. Most update mistakes come from not knowing which files
are hand-maintained and which are written by automation.

## Golden rules

1. **Sync before you edit.** This repo receives automated commits from CI, so a
   local checkout is frequently many commits behind. Always
   `git fetch origin && git checkout main && git pull --ff-only` first. Editing a
   stale tree causes conflicts and re-does work CI already did.
2. **Never hand-edit generated files** (see the map below). CI overwrites them on
   the next release/deploy, so your changes would be lost *and* can conflict.
3. **Branch + PR. Never commit directly to `main`.** `main` is the live site.
   Create a branch, open a PR, and let it merge.
4. **No `Co-Authored-By` lines and no "Generated with…" footer** in commits or PR
   descriptions.
5. **Verify locally** before opening the PR (see *Local preview*).

## Repo map — who owns what

| Path | Owner | Notes |
|------|-------|-------|
| `index.html`, `quickstart.html` | **You (manual)** | Marketing / landing copy. |
| `downloads.html` | **You (manual)** | The *page shell + JS*. The version numbers it shows come from JSON — see below. |
| `guide/*.html` | **You (manual)** | Documentation pages. |
| `guide/icons.svg` | **You (manual)** | Shared icon sprite for the guide. **Sync from the app repo** — see *Icons*. |
| `guide/icons-loader.js` | **You (manual)** | Injects `guide/icons.svg` so `<use href="icons.svg#id">` resolves. |
| `favicon.svg`, `images/` | **You (manual)** | Site chrome and screenshots. |
| `downloads/stable/*.json` | **CI (auto)** | Written by the app repo's `deploy-{linux,macos,windows}.yml` on release publish. |
| `downloads/snapshot/*.json` | **CI (auto)** | Written by the app repo's RC deploy on main-branch pushes. |
| `app/` | **CI (auto)** | The **deployed stable web app** build (`deploy.yml` copies `dist/` here). Includes its own `app/icons.svg`, `app/favicon.svg`. Do **not** touch. |
| `app-rc/` | **CI (auto)** | The **deployed preview build** (`deploy-rc.yml`). Do **not** touch. |
| `site/` | **You (manual)** | Source of the new generated site. Not live until the cutover. |
| `.github/workflows/site.yml` | **You (manual)** | Builds and verifies `site/`; deployment is off until the cutover. |
| `planning/` | **You (manual)** | Decision records and runbooks for the site and manual work. |
| `.nojekyll` | **You (manual)** | Stops the Pages branch build from running Jekyll (which dropped `_`-prefixed app files). |

The automation lives in the **app repo** (`PureCutCNC/purecutcnc`) under
`.github/workflows/deploy*.yml`; those jobs check out this repo and push commits
here as `github-actions[bot]` (e.g. `deploy: update app from release vX`,
`downloads: update … stable metadata for vX`). This repo's only workflow,
`site.yml`, builds and verifies `site/` on every push to `main` (including those
automated commits) or `site-revamp`, and on pull requests.

## How the moving parts work

### Download cards (`downloads.html`)
The page fetches `downloads/{channel}/{platform}.json` at runtime and renders a card
per platform/track. Those JSON files carry the version, tag, release URL, and asset
links, and are **updated automatically** when a release is published — you normally
do nothing. (The GitHub API `releases/latest` is only used for the FAQ "latest
stable" link and the empty-state fallback message.)

### Hero version badge (`index.html`)
`<span id="js-hero-version">` is **empty and `hidden` in the markup**. JS fills it
in at runtime from the GitHub API's `releases/latest` and unhides it, so the badge
self-updates once a release is published. **Never hardcode a version there** — a
static fallback only goes stale and contradicts the live value. If the API call
fails or is rate-limited the span stays hidden and the badge degrades to just the
feature list, which still reads correctly.

The rest of the badge (`Multi-language · Dark/Light themes · …`) *is* hand-written
— refresh those feature words on a release so they headline what's actually new.

### Icons (the shared sprite)
The **source of truth** is the app repo at `public/icons.svg`. There are copies in
this repo:
- `app/icons.svg`, `app-rc/icons.svg` — **auto** (part of the deployed build). Leave alone.
- `guide/icons.svg` — **manual copy** used by the guide pages. It drifts behind the
  app sprite when new icons are added and must be re-synced by hand.

To sync: copy the app repo's `public/icons.svg` over `guide/icons.svg` wholesale
(both share the same `<svg xmlns=…><symbol id=… viewBox=…>…</svg>` structure).
Verify the symbol count matches and spot-check that referenced ids resolve.

## Playbook — when a new version ships

1. **Sync** this repo (`git pull --ff-only` on `main`), then branch.
2. **Confirm CI already ran** (usually within minutes of publishing the release):
   `downloads/stable/*.json` should read the new `"version"`, and there should be a
   `deploy: update app from release vX` commit. If not, wait for CI rather than
   editing those files by hand.
3. **Refresh the hero badge tagline** in `index.html` so it headlines the new
   release's features. Leave the version alone — it's injected at runtime and must
   stay out of the markup (see *Hero version badge*).
4. **Refresh feature copy** in `index.html` for anything new or changed. Pull the
   change list from the GitHub release notes:
   `gh release view vX --repo PureCutCNC/purecutcnc`. Fix anything now inaccurate
   (e.g. a renamed/removed operation).
5. **Sync `guide/icons.svg`** from the app repo's `public/icons.svg` if new icons
   were added.
6. Optionally add/adjust **guide pages** for major new features.
7. **Verify locally**, then open a PR.

## Playbook — adding or updating a guide page

- Guide pages live in `guide/` and load the sprite via
  `<script src="icons-loader.js"></script>` + `<use href="icons.svg#id">`.
- If a page needs an icon that isn't in `guide/icons.svg` yet, sync the sprite from
  the app repo first (don't hand-add a single symbol — keep the copy whole).

## Working on the new site (`site/`)

- The revamp lives on the `site-revamp` integration branch. Branch from it and
  open revamp PRs against it, not `main`; it reaches `main` in one merge before
  the cutover (see `planning/SITE_PLATFORM.md`).
- Setup and commands are in `site/README.md`: `npm ci --prefix site`, then
  `npm run ci` inside `site/`.
- Before writing a User Guide page, read `planning/MANUAL_BLUEPRINT.md`. Every
  page is already listed, with its title, type, and owning workstream, in
  `site/config/manual-structure.mjs`; start from `site/templates/<type>.mdx` and
  run `npm run content`. Don't add pages or sections outside that file.
- When a page replaces a legacy `guide/*.html` page, update its entry in
  `site/config/legacy-routes.mjs` in the same PR.
- `planning/manual-coverage.csv` lists every capability the manual must cover
  and which page and workstream own it. Update its rows when your page lands
  (see `planning/MANUAL_COVERAGE.md`); `npm run coverage` checks it.
- The new site copies `app/`, `app-rc/`, and `downloads/` from the root at build
  time and reads icons from `app-rc/icons.svg`, so it needs no hand-synced copies.
- The old `images/` and `guide/screenshots/` URLs are kept as frozen copies in
  `site/public/`. After merging `main` into `site-revamp`, run
  `npm run legacy:sync` in `site/` if those images changed.
- Until the cutover, fixes that must go live now still belong in the root files.

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

From the repo root:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/`:
- **index.html** — hero shows the right version; new/changed features described.
- **downloads.html** — each Stable card shows the new version with working asset
  links (served from JSON).
- a **guide page** — icons render (spot-check the newest ones); no `icons.svg` 404
  in the browser console.

Then: branch → stage → commit (no co-author, no attribution footer) → PR.
