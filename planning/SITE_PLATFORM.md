---
status: proposed
authoritative-for: how purecutcnc.github.io is built, verified, deployed, and cut over from the hand-maintained pages
last-verified: 2026-09-16
---

# Site Platform: Astro + Starlight on GitHub Pages

Outcome of the platform spike in #20, part of #23 and #24.

## Recommendation

Adopt **Astro 7.3 + Starlight 0.42**, built by GitHub Actions and deployed to GitHub Pages
with `actions/deploy-pages`. The spike shows that it:

- builds the whole public site, including the automation-owned `app/`, `app-rc/`, and
  `downloads/` directories, into one static artifact with one command;
- keeps the site's visual identity (header, wordmark, palette, landing and downloads pages)
  while the manual gets Starlight's navigation, table of contents, and static search;
- keeps every URL the current site publishes working, including old `#fragment` links;
- needs no server or paid host.

Nothing in production changes until the cutover below is approved and carried out.

## How the artifact is built

`site/` is a self-contained Astro project. `npm ci --prefix site && npm run build --prefix site`
writes `site/dist/`:

| Artifact path | Source |
| --- | --- |
| `/`, `/downloads/` | `site/src/pages/` (Astro pages, dark brand styling) |
| `/guide/**`, `/quickstart/`, `/404.html` | `site/src/content/docs/` (Starlight) |
| `/pagefind/` | Search index, built by Starlight from the manual pages only |
| `/_astro/` | Hashed CSS, JS, and optimized WebP images |
| `/favicon.svg`, `/images/sketch-full-page.png` | `site/public/` |
| `/downloads.html`, `/quickstart.html`, `/guide/*.html` | Redirect pages from `site/config/legacy-routes.mjs` |
| `/app/`, `/app-rc/`, `/downloads/*/*.json` | Copied byte-for-byte from the repository root |

The copy and the redirect pages are produced by `site/integrations/site-artifact.mjs` after
Starlight builds the search index, so neither the web app bundles nor the redirects are
indexed. The integration refuses to overwrite any generated file.

The spike artifact is 55 MB on disk (251 files): 16 MB `app/`, 29 MB `app-rc/`, 7.4 MB
optimized images and assets, 0.7 MB search index. The Pages limit is 1 GB.

## Deployment

`.github/workflows/site.yml`:

| Job | Runs on | Does |
| --- | --- | --- |
| `build` | every push to `main` or `site-revamp`, pull request, `workflow_dispatch`, `repository_dispatch: site-rebuild` | `npm ci`, `astro check`, build, `npm run verify`; uploads the Pages artifact on `main`, and a `site-preview` artifact everywhere else |
| `deploy` | `main` only, and only when the repository variable `PAGES_DEPLOY_ENABLED` is `true` | `actions/deploy-pages` into the existing `github-pages` environment (already restricted to `main`) |
| `smoke-test` | after `deploy` | `verify-artifact.mjs --url https://purecutcnc.github.io`, retried while the CDN updates |

Each branch has one concurrency group, so a burst of automated pushes to `main` builds and
deploys the newest commit rather than every intermediate one. GitHub's 10-builds-per-hour
soft limit does not apply to custom Actions deployments.

### Integration branch

The revamp is assembled on `site-revamp`, created from `main` at `7c7dbb0`, and reaches
`main` in one merge just before the cutover:

- Every revamp pull request (this spike, #21, #22, and the Wave 2 content issues) targets
  `site-revamp`. Pull requests and pushes there are built and verified, and each run
  uploads a `site-preview` artifact. Nothing on `site-revamp` is deployed.
- `main` stays the live site. Release copy fixes keep going to the root files on `main`,
  and the automated `app/`, `app-rc/`, and `downloads/` commits keep landing there.
- `site-revamp` never edits the automation-owned directories, so merging `main` into it
  is conflict-free apart from hand-edited files both branches touch (`AGENTS.md`,
  `README.md`). Merge `main` in whenever previews should show a current `app-rc/`, when a
  Wave 2 page needs a copy change made on `main`, and before the final merge.
- Until the final merge, `.nojekyll` and `site/` stay off `main`, so the live Jekyll build
  is untouched.

### Today's Pages configuration

Checked with `gh api repos/PureCutCNC/purecutcnc.github.io/pages` on 2026-09-16:
`build_type: legacy`, source `main` / `(root)`. That is the Jekyll-based "Deploy from a
branch" build. This spike does not change it.

## Rebuilds for automated app and download commits

The app repository's `deploy.yml`, `deploy-rc.yml`, and `deploy-{linux,macos,windows}.yml`
check out this repository with `secrets.PAGES_DEPLOY_TOKEN` and push to `main`.

Evidence that those pushes will start `site.yml`:

- The Events API attributes every recent push to `main` to the user account `zabooma`, and
  the legacy `pages build and deployment` runs for the automated `deploy-rc:` commits are
  triggered by `zabooma`. The token is therefore a personal access token, not
  `GITHUB_TOKEN`.
- GitHub suppresses workflow runs only for events created with `GITHUB_TOKEN`. Pushes made
  with a personal access token (or a GitHub App token) start `push` workflows normally.
- Volume: 1–9 automated pushes per day during August–September 2026.

**Still to confirm empirically:** a push only starts workflows whose files are on the
pushed branch, and automated commits go to `main`. With the revamp held on `site-revamp`,
the proof comes after the final merge into `main` (step 2 of the cutover runbook), while
deployment is still disabled. The next automated commit should then produce a `Site` run.
Confirm with:

```sh
gh run list --repo PureCutCNC/purecutcnc.github.io --workflow site.yml --event push --limit 5 --json headSha,displayTitle,conclusion,createdAt
```

The run for a `deploy-rc: update from …` commit is the proof. Record it on #20 or #24.

To get the proof earlier, a pull request to `main` could add only a workflow file that
starts on `push` and does nothing else. Jekyll ignores `.github/`, so the live site would
not change.

**Explicit fallback.** If the app repository ever switches to a token that cannot start
workflows, add a final step to each of its deploy workflows:

```yaml
- name: Request a site rebuild
  env:
    GH_TOKEN: ${{ secrets.PAGES_DEPLOY_TOKEN }}
  run: gh api repos/PureCutCNC/purecutcnc.github.io/dispatches -f event_type=site-rebuild
```

`site.yml` already listens for `repository_dispatch` with type `site-rebuild`. A manual
rebuild is `gh workflow run site.yml --repo PureCutCNC/purecutcnc.github.io --ref main`.

## URLs and compatibility

New pages use directory URLs with a trailing slash. Every URL the current site publishes
still works:

| Current URL | In the new artifact |
| --- | --- |
| `/`, `/index.html` | Landing page |
| `/downloads.html` | Redirect to `/downloads/` |
| `/quickstart.html` (+ `#step-*`) | Redirect to `/quickstart/`, each step anchor mapped to its new heading |
| `/guide/`, `/guide/index.html` | Manual overview |
| `/guide/cam-tools.html` (+ fragments) | Redirect to `/guide/cam-setup/tool-library/`; heading ids unchanged |
| `/guide/cam-operations.html#op-pocket` | Redirect to `/guide/operations/pocket/` |
| Other `/guide/*.html` (21 pages) | Redirect to `/guide/` for now, marked `pending` |
| `/app/`, `/app-rc/`, `/downloads/{stable,snapshot}/*.json` | Unchanged copies |
| `/images/sketch-full-page.png` (social preview image) | Unchanged |

Redirect pages are static HTML at the exact old path. A small script keeps the query string
and fragment and applies per-fragment mappings; a `<meta http-equiv="refresh">` covers
clients without JavaScript, and `rel="canonical"` points at the new page. Tested in the
built artifact: `/quickstart.html#step-tool` lands on
`/quickstart/#import-a-14-end-mill-from-the-tool-library`,
`/guide/cam-tools.html?ref=forum#tool-properties` keeps both the query and the fragment,
and `/guide/cam-operations.html#op-pocket` lands on the Pocket page.

Not preserved: the per-page assets under `/guide/` (`guide.css`, `icons.svg`,
`icons-loader.js`, `screenshots-loader.js`, `screenshots/*.png`) and the Quick Start images
under `/images/`. Nothing outside this repository was found linking to them (app repository
source, README, and release notes were searched).

The app itself links to `https://purecutcnc.github.io/downloads.html` (error and phone
screens), `https://purecutcnc.github.io/`, and fetches
`https://purecutcnc.github.io/downloads/{channel}/{platform}.json` for update checks. All
three keep working.

**Why `/downloads/` rather than keeping `/downloads.html`.** Starlight is built for
directory URLs, and Astro's `build.format: 'preserve'` would turn the manual root into
`/guide.html`. The downloads page therefore lives at `downloads/index.html`, beside the
generated JSON; the build fails if the two would ever collide, and `/downloads.html`
redirects.

## Findings

1. **The live site drops underscore-prefixed files.** The Jekyll branch build ignores names
   starting with `_`, so `app/assets/__vite-browser-external-*.js` and its `app-rc/`
   counterpart return 404 today (both referenced from the app's `vendor` chunk as lazy
   imports). The Actions deployment serves them. This change also adds `.nojekyll` at the
   repository root, which fixes it for the current branch build and keeps Jekyll from
   parsing the new `site/` sources once they are on `main` (`.astro` files open with a
   `---` block that Jekyll would read as YAML front matter, and `{{ … }}` is Liquid syntax).
   Side effects on the current site: `/AGENTS.html`, which Jekyll renders from `AGENTS.md`,
   goes away, and Markdown files are served as plain text.
2. **The guide's icon sprite is stale.** `guide/icons.svg` has 113 symbols; `app/icons.svg`
   and `app-rc/icons.svg` have 117, and `app-rc/icons.svg` is identical to the app's
   `public/icons.svg`. `AppIcon` reads the app's sprite at build time, so the manual sync
   step in `AGENTS.md` ends with the cutover, and a missing icon fails the build.
3. **Icon names are not self-describing.** The sprite's `pocket` symbol is the "create
   regions" target in the tool rail, not the Pocket operation. Manual pages should cite an
   icon only after finding where the app uses it.
4. **Astro drops a line break next to an inline element**: `the\n<a>` renders as `the<a>`
   and `</a>\nto` as `</a>to`. In `.astro` files, keep inline elements on the same line as
   the words around them. (Markdown and MDX pages are not affected.)
5. **The search index can be written incompletely.** The first build in a fresh clone
   produced an empty `pagefind/pagefind-entry.json` (and `pagefind-highlight.js`), which
   breaks search. It did not recur in 22 further builds, sequential or parallel. Starlight
   writes the index through Pagefind's Node API, which kills the indexer process as soon
   as its write call returns, so a slow disk can plausibly truncate files. The build now
   checks the index and rebuilds it with the Pagefind CLI (which runs to completion) when
   any file is empty, and `verify` fails on an empty or unreadable index. Both paths were
   tested by truncating those two files in a copy of the artifact. Worth reporting upstream
   if it shows up in CI logs ("Search index is incomplete").
6. **Upstream noise, left as is:** Starlight's search button fails Lighthouse's
   label-in-name check; the build warns that the optional `i18n` collection is empty, that
   `/404` is rendered by the dedicated route, and about a module-level directive in MDX
   bundles. None affect the output.
7. **Theme.** Marketing pages stay dark, as today. The manual follows the system theme with
   branded light and dark palettes. Whether the marketing pages should follow the theme too
   is a design decision for later.

## Verification results (2026-09-16, app commit `0b33a41`, generated content from `7c7dbb0`)

`npm run check` reports 0 errors, warnings, or hints. `npm run build && npm run verify` on
Node 26:

```text
required URLs      20
generated files    103 byte-identical copies of app/, app-rc/, downloads/
legacy redirects   24 (21 pending)
internal links     350 in 7 pages
search index       4 pages
Passed with 27 warning(s)
```

The warnings are the 21 pending legacy pages and 6 sample-page links that still point at
`/guide/cam-operations.html`. `npm run verify:cutover` turns all 27 into errors, as intended.
A tampered copy of the artifact (an edited `app/index.html`, a deleted redirect page, and a
broken link) failed, with each problem reported.

Checked in Chrome against `astro preview` of the artifact:

- landing page at 1440 px; downloads page at 1440 px and 390 px, with all six cards filled
  from `/downloads/*/*.json` and the latest-stable link filled from the GitHub API;
- manual pages in light and dark mode, the phone menu drawer with the site links, numbered
  Quick Start steps, and an inline app icon;
- search: "stepover" returns the Pocket, Tool Library, and Quick Start sections;
- the legacy redirects listed above, plus `/guide/view-3d.html#3d-navigation` (pending →
  `/guide/#3d-navigation`);
- Lighthouse: Tool Library page accessibility 100 (desktop); landing page accessibility 95
  (mobile) before underlining in-text links, which was the only failure;
- `astro dev` serves `/app/`, `/app-rc/`, the JSON files, and the redirect pages.

## Contract for the information architecture (#22)

- **Frontmatter.** Starlight's `title` and `description` are required. The schema in
  `site/src/content.config.ts` also accepts a provisional `pageType` (`overview`, `tutorial`,
  `task`, `reference`, `troubleshooting`) and `reviewed: { appCommit, date }`. #22 decides
  which become required; the build then rejects pages without them.
- **URLs.** `/guide/<section>/<page>/`, with one folder per sidebar section. Sections list
  their folder automatically, ordered by `sidebar.order`, so page authors never edit
  `astro.config.mjs`.
- **Components available to pages.** `Screenshot` (optimized, captioned, alt text required),
  `AppIcon` (verified against the app sprite), and Starlight's `Aside` (`note`, `tip`,
  `caution`, `danger`), `Steps`, `Tabs`, `Card`, `LinkCard`, `Badge`, and `FileTree`.
- **Shared files.** `astro.config.mjs` (sections), `config/legacy-routes.mjs`, and the
  components belong to the platform. A Wave 2 issue that migrates a legacy page edits only
  that page's entry in `legacy-routes.mjs`.

## Cutover runbook

Preconditions:

1. #21 and #22 are approved and the Wave 2 content is merged into `site-revamp`.
2. `main` has been merged into `site-revamp`, the latest `Site` run on `site-revamp`
   passed, and `npm run verify:cutover` passes there.
3. That run's `site-preview` artifact has been reviewed: landing, downloads, Quick Start,
   several manual pages, search, and a sample of legacy links.
4. `PAGES_DEPLOY_ENABLED` is unset or `false`.

Steps:

1. Merge `site-revamp` into `main` with a merge commit. The live site keeps serving the
   root files; the only change the Jekyll build sees is `.nojekyll`. Check that the
   resulting `Site` run on `main` passes, with `deploy` skipped.
2. Wait for the next automated `deploy-rc:` push and confirm it started a `Site` run (see
   above). If it did not, add the `repository_dispatch` step to the app workflows first.
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**. (Equivalent:
   `gh api -X PUT repos/PureCutCNC/purecutcnc.github.io/pages -f build_type=workflow`.)
4. `gh variable set PAGES_DEPLOY_ENABLED --body true --repo PureCutCNC/purecutcnc.github.io`
5. `gh workflow run site.yml --repo PureCutCNC/purecutcnc.github.io --ref main`, then watch
   `build`, `deploy`, and `smoke-test` succeed.
6. By hand on the live site: `/`, `/downloads.html`, `/quickstart.html#step-tool`,
   `/guide/`, a few old `/guide/*.html#…` links, `/app/` (loads and opens a project),
   `/app-rc/`, search, and the app's own "Desktop downloads" link.
7. After the next automated app commit, confirm that a `Site` run deployed it (for
   example, `/app-rc/` serves the new build).
8. Record the date, the deployed commit, and the checks on #24.

If step 1 has to be undone before step 3, revert the merge commit on `main`; the live site
was never switched.

Keep the hand-maintained root files (`index.html`, `quickstart.html`, `downloads.html`,
`guide/`, `images/`, `favicon.svg`) until the rollback window closes; removing them, and
updating `AGENTS.md` and `README.md`, is a separate pull request.

## Rollback runbook

1. `gh variable set PAGES_DEPLOY_ENABLED --body false --repo PureCutCNC/purecutcnc.github.io`
2. Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
   GitHub rebuilds the legacy site from `main`, where the hand-maintained files and the
   latest automated `app/`, `app-rc/`, and `downloads/` commits still are.
3. Check `/`, `/downloads.html`, `/guide/`, `/app/`, and `/app-rc/` on the live site.
4. Record the rollback and its cause on #24.

Rollback depends on the root files still existing, which is why their removal waits.

## Open questions

- Stable versus preview documentation, and how preview-only features are labeled (#22).
- Whether the marketing pages should follow the light theme.
- Whether the Quick Start stays at `/quickstart/` or moves under `/guide/` (#22); only its
  redirect entry would change.
- The repository grows with every automated `app-rc/` commit (57 MB packed today). Publishing
  the web app builds as workflow artifacts instead of commits would stop that, but it is an
  app-repository change and out of scope here.
