# AGENTS.md — how to update this site

This repo is the **public website for PureCut CNC**, served as a static site at
`https://purecutcnc.github.io` via GitHub Pages (the `main` branch is the live
site). It is plain HTML/CSS/JS — there is **no build step**.

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

The automation lives in the **app repo** (`PureCutCNC/purecutcnc`) under
`.github/workflows/deploy*.yml`; those jobs check out this repo and push commits
here as `github-actions[bot]` (e.g. `deploy: update app from release vX`,
`downloads: update … stable metadata for vX`). There are **no workflows in this
repo**.

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
