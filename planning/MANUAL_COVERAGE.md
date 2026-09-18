---
status: proposed
authoritative-for: which app capabilities the user manual must cover, how well the current guide covers them, and how Wave 2 content work is divided
last-verified: 2026-09-16
---

# Manual Coverage Inventory

Outcome of #21, part of #23 and #24. It is the evidence base for the information architecture
(#22) and for the Wave 2 content issues.

## What was audited

| Input | Version |
| --- | --- |
| Application | `PureCutCNC/purecutcnc` `main` at **`0b33a4137cac0cf6e2645c7c777339b9c17a2762`** (2026-09-16, PR #792). The same build is deployed to `/app-rc/`. |
| Baseline release | `v0.4.0` at `940912b` (2026-08-27). "Since v0.4.0" means `v0.4.0..0b33a41`: 166 commits (120 excluding merges), with merged PRs #691–#792. |
| Current guide | `guide/*.html` and `quickstart.html` as of `7c7dbb0`: 23 pages plus the Quick Start, 153 sections, about 26,000 words. |

App behaviour was read from the pinned source, not from the guide. The evidence came from:

- **UI strings:** the complete English catalogue, 2,294 strings in `src/i18n/locales/en/*`. These name every label, hint, dialog and warning a user can see.
- **Project model:** `src/types/project.ts`, which lists operation kinds, patterns, strategies, drill types, feature roles, tool types and clamp and tab shapes.
- **Field visibility:** the operation field groups and visibility rules in `src/components/cam/operationFields.ts`.
- **Specific screens:** the component source for the export dialog, CAM Plan, the generation menu, the keyboard handlers and the desktop menus (`src-tauri/src/lib.rs`).
- **Tests:** unit tests and the Playwright smoke specs named in each row.
- **Design references:** `PROJECT.md`, `ARCHITECTURE.md`, the area `INDEX.md` files, and `planning/*.md` in the app repository.

## The files

| File | One row per | Use it to |
| --- | --- | --- |
| [`manual-coverage.csv`](manual-coverage.csv) | user-facing capability (149) | find what the manual must say, where the evidence is, and which page and workstream own it |
| [`legacy-guide-inventory.csv`](legacy-guide-inventory.csv) | section of the current guide (153) | see how good each existing section is, and where its content and its old `#anchor` go |

GitHub renders both as searchable tables. For filtered views, run the checker from `site/`:

```sh
node scripts/check-coverage.mjs                                   # validate and summarise
node scripts/check-coverage.mjs --where coverage=missing          # every undocumented capability
node scripts/check-coverage.mjs --where workstream=W4,coverage=stale
node scripts/check-coverage.mjs --sections --where disposition=rewrite
```

`npm run coverage` runs the same check, and CI runs it on every build.

### Capability columns

| Column | Meaning |
| --- | --- |
| `id` | Stable key, `area.name`. Never reuse or rename one; add a new row instead. |
| `area` | Proposed manual section: `start-here`, `fundamentals`, `design`, `cam-setup`, `operations`, `strategies`, `verify-export`, `reference`. |
| `capability`, `ui_surface` | What the user can do, and where in the app. |
| `legacy_guide` | Current guide sections (`page#anchor`, `;`-separated) that cover it. Empty only when `coverage` is `missing`. |
| `coverage` | `accurate`: matches the app. `incomplete`: correct but missing parts. `stale`: says something the app no longer does. `missing`: not covered at all. |
| `gaps` | What is wrong or absent. Required unless `accurate`. |
| `priority` | `release-critical`: the next release's manual must cover it. `reference`: deep or occasional material that can follow. |
| `since_v040` | `new` (added after v0.4.0), `changed` (behaviour or UI changed after v0.4.0), or `no`. |
| `media` | Screenshots or diagrams the page needs. "exists" means a current guide image can be re-shot rather than designed. |
| `evidence` | Source files, tests, specs, or `i18n:` keys at the pinned commit. |
| `destination` | Proposed page and anchor in the new manual. |
| `reviewer` | Technical review role: `CAM toolpaths`, `CAM planning`, `post/G-code`, `sketch`, `import`, `simulation/3D`, `shell/UI`, `desktop/platform`, `i18n/theme`. |
| `workstream` | Wave 2 owner (see below). |

### Inventory columns

`legacy_page`, `anchor`, `heading`, `words` and `screenshots` describe the existing section.
`assessment` is `accurate`, `incomplete` or `stale`. `disposition` is one of:

- `migrate`: carry the content over and edit it;
- `rewrite`: the topic stays, but the text needs rewriting;
- `split`: the content moves to several pages;
- `merge`: fold it into another section;
- `drop`: navigation-only or obsolete.

`destination` and `workstream` say where the content (and the old anchor's redirect) goes.
`capabilities` lists the matrix rows that cite the section.

### What the checker enforces

- Headers, enumerations, unique ids, required text, and the `missing` ⇔ empty `legacy_guide` rule.
- Every `legacy_guide` reference exists in the inventory. Every inventory section is cited by at least one capability, and its `capabilities` column matches those citations exactly.
- While `guide/` and `quickstart.html` exist, the inventory lists exactly the sections their HTML contains.
- **Disjoint ownership.** Every destination is a page in the page tree (`site/config/manual-structure.mjs`, defined by #22), each page there has exactly one owning workstream, and every row's `workstream` must match its page. Every planned page has at least one capability row.

### Keeping it current

When a Wave 2 page merges, update its rows in the same pull request: set `coverage` to `accurate`, clear `gaps`, and point `evidence` at the commit you checked if it differs from `0b33a41`. Add rows for capabilities that ship later. Never delete a row just because its page is done. When the old guide is removed after the cutover, the inventory becomes a historical record and the HTML comparison switches off.

## Summary

| Area | Accurate | Incomplete | Stale | Missing | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Start Here | 0 | 3 | 2 | 2 | 7 |
| Fundamentals | 8 | 11 | 8 | 1 | 28 |
| Design | 15 | 9 | 9 | 2 | 35 |
| CAM Setup | 5 | 7 | 5 | 1 | 18 |
| Machining Operations | 1 | 5 | 9 | 0 | 15 |
| Advanced Strategies | 5 | 1 | 5 | 6 | 17 |
| Verify and Export | 7 | 3 | 4 | 3 | 17 |
| Reference and Troubleshooting | 1 | 5 | 1 | 5 | 12 |
| **Total** | **42** | **44** | **43** | **20** | **149** |

- **Release-critical:** 102 capabilities. 20 are accurate today; 15 are missing and 34 stale.
- **Changed since v0.4.0:** 35 capabilities (12 new, 23 changed). None is fully documented: 12 are missing, 18 stale, 5 incomplete.
- **Legacy sections:** 83 accurate, 31 incomplete, 39 stale. Dispositions: 101 migrate, 28 rewrite, 7 split, 13 merge, 4 drop.
- **Proposed pages:** 68 destination pages across the eight sections. This is input for #22, not a decision.

### Notable changes since v0.4.0

These are the changes #21 names explicitly.

| Change | Row | Coverage now |
| --- | --- | --- |
| STEP import | `design.import-step` | missing |
| Text on a circle or path | `design.text-layout` | missing |
| CAM planning (CAM Plan, coverage review) | `cam.cam-plan` | missing |
| Trochoidal pocket clearing (also surface clean and 3D rough; orbited ring links) | `strat.trochoidal-pocket` | missing |
| Constant-scallop finishing | `strat.constant-scallop` | missing |
| Slope filtering | `strat.slope-filter` | missing |
| Scallop-height control | `strat.scallop-height` | missing |
| GPU toolpath rendering | `verify.gpu-renderer` | missing |
| Z-level preview filter | `verify.level-filter` | missing |
| WebGL fallback (2D workspace stays usable) | `verify.webgl-fallback` | incomplete |

The inventory also found these changes since v0.4.0:

| Change | Row | Coverage now |
| --- | --- | --- |
| XY approach and exit arcs (#715) | `strat.xy-lead` | missing |
| Worker-backed generation and the Compute menu (#734) | `cam.generation` | stale |
| Add-menu validity partition (#733) | `cam.add-menu` | incomplete |
| Clamp avoidance during generation (#731) | `cam.clamps` | stale |
| Non-target subtract folding (#737, #740, #751, #758) | `strat.subtract-fold` | missing |
| Model cross-section protection (#777, #780, #785) | `strat.model-protection` | incomplete |
| Export refusing a tool change it cannot emit (#763) | `verify.export-blocking` | missing |
| Tool library grown from 26 to 34 entries | `cam.tool-import` | stale |

## Findings

### Stale instructions that would mislead a user today

- **Quick Start step 5.**
  - It describes an operation-type dropdown and toggling operation visibility in the feature tree. Operations are added from the Add menu's Rough / Finish / Both rows, and their visibility is set in the operations list.
  - Its entry tip points at Advanced → Entry; the group is now Entry & retract.
  - Its export step skips the operation checklist.
- **Exported motion inspector.** The guide says to tick Debug toolpath first. That checkbox exists only in development builds (`CAMPanel.tsx`, `import.meta.env.DEV`). The inspector button actually appears whenever exactly one eligible operation is selected in the export dialog.
- **G-code export.** "Only enabled and visible operations are exported" is no longer the rule. The dialog has a per-operation checklist whose default is enabled, has a tool, and visible.
- **Old controls that don't exist.** The guide describes controls the app no longer has, or never had:
  - "Duplicate as Reference / Duplicate Independent" menu items;
  - a "Remove original text" checkbox;
  - a V-carve medial "Step Size" field;
  - an editable stock material;
  - a gear "module" input;
  - Space+drag panning;
  - double-click to reset the 3D view;
  - Shift as the axis-lock key.
- **Renamed or reorganised settings.**
  - Waterline refinement fields (the UI has Adaptive refinement, Adaptive spacing, Max rings / band).
  - Corner rounding names (Round corners, Round link junctions, Round wall corners).
  - The countersink field (Countersink diameter).
  - Several references to a single "Advanced" section, which is now the operation groups.
- **Workflows that changed shape.** Offset is a live-preview panel, not a dialog. Cut asks for cutters first, then targets. Rest machining is an explicit button on pocket and edge-route operations, not automatic on edge routes.
- **Clamps** are described as affecting only rapid moves. Generation now keeps cuts clear of clamps, and says how much material that leaves.

### Missing coverage beyond the post-v0.4.0 list

- Installing and opening the app, system requirements, and the desktop update check with its Stable/Snapshot channel.
- The status bar, the generation status and Compute menu, CAM Plan, and export-blocking messages.
- A single safety page, a keyboard-shortcut table, a file-format table, a warning reference, and troubleshooting.

### Structure problems

- **The Operations page** is 5,040 words, a fifth of the guide. It mixes an operation catalogue, requirements, every parameter table and six strategy essays. The inventory splits it into 11 operation pages, a common-parameters page and six strategy pages. Its `op-*` anchors keep working through redirect anchors.
- **Duplicated topics.** Sketch navigation appears twice with conflicting controls (`sketch-tools#canvas-navigation` and `view-sketch#sketch-navigation`). Toolpath display is split between `sketch-toolpaths`, `view-3d` and `view-sketch`. Z-coordinate rules are repeated in Concepts and the Quick Start.
- **Hard-to-find content.** Feed colours are documented only on the Operations page. The machine definition field reference sits inside the G-code Export page, and booklets are also documented there.
- **Release-note phrasing** ("Only K is new", "Every rapid is now drawn", "moved from the earlier orange accent") appears in at least eight sections. It should be rewritten as reference text.
- **Screenshots.** The guide references 69 screenshots, and every one predates the current UI. Of the 149 rows, 100 ask for new or re-shot media (the `media` column). `planning/manual-visual-inventory.json` turns those capability hints into page-level proposals and explicit text-only decisions. Human review promotes useful proposals into the deterministic capture queue; Wave 3 then produces them from recorded fixtures, as #24 plans.

### In-app text that disagrees with the app

These belong in `PureCutCNC/purecutcnc`, not in the manual. The first is filed as PureCutCNC/purecutcnc#795. The other two are left to the Wave 2 issues that own those pages: #30 (STEP) and #29 (Snapshot).

- **Operation descriptions list incomplete strategy choices.** Some Add-menu descriptions enumerate the strategies an operation offers, and those lists are out of date:
  - **Pocket** and **Surface clean** give the pattern as offset or parallel, without Seeded circles or Trochoidal.
  - **3D surface rough** mentions only offset clearing.
  - **Drill** lists four cycle types, without the Helical and Countersink drill types.

  Either complete the lists or stop enumerating strategies in descriptions.
- The empty-state card lists import formats without STEP (`viewport.empty.importMeta`).
- The desktop update menu calls the preview track **Snapshot**; the website calls it **Preview Build**.

Found later, while defining the terminology rules in #22: the tool type label **V-Bit**, and **Top Z** / **Bottom Z** in CAM Plan and the setup booklet, disagree with the rest of the app (PureCutCNC/purecutcnc#797).

### Public-site copy to fix during release integration (Wave 3)

- The landing page says gears take a module input.
- It says edge routes generate rest regions automatically.
- It lists 3D import as STL and OBJ only.
- The Tool Library sample page added in #25 still says 26 tools (corrected in #22).

## Recommended Wave 2 issues

Five workstreams, each owning a disjoint set of pages (the `owner` of each page in `site/config/manual-structure.mjs`):

| Workstream | Owns | Pages | Capabilities | Release-critical | Missing / stale | Media rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| **W1 Foundations** | `/guide/`, `/quickstart/`, `/guide/start-here/`, `/guide/fundamentals/`, `/guide/reference/{themes,languages,keyboard-shortcuts,glossary,privacy-and-data}/` | 18 | 39 | 30 | 5 / 11 | 28 |
| **W2 Design and import** | `/guide/design/` | 12 | 36 | 20 | 2 / 9 | 27 |
| **W3 CAM setup and 2.5D operations** | `/guide/cam-setup/`, `/guide/operations/` (except `3d-*`) | 16 | 30 | 25 | 1 / 11 | 24 |
| **W4 3D operations and strategies** | `/guide/operations/3d-*`, `/guide/strategies/` | 10 | 20 | 15 | 6 / 8 | 13 |
| **W5 Verify, export and reference** | `/guide/verify-export/`, the rest of `/guide/reference/` | 12 | 24 | 12 | 6 / 4 | 8 |

Suggested reviewers:

| Workstream | Reviewers |
| --- | --- |
| W1 | shell/UI, sketch, desktop/platform, i18n/theme |
| W2 | sketch, import |
| W3 | CAM planning, post/G-code, CAM toolpaths |
| W4 | CAM toolpaths |
| W5 | post/G-code, simulation/3D |

W3 and W4 carry the safety-sensitive CAM claims that #24 requires to be technically reviewed.

### Redirect entries

Each legacy page's entry in `site/config/legacy-routes.mjs` has one owner:

| Owner | Legacy pages | Others supply anchors |
| --- | --- | --- |
| W1 | `index`, `interface`, `concepts`, `appearance`, `language`, `view-sketch`, `quickstart` | W3 supplies `interface#cam-panel` |
| W2 | `sketch-tools`, `sketch-edit`, `sketch-import`, `sketch-text`, `sketch-dimensions`, `sketch-snapping` | W1 supplies `sketch-tools#canvas-navigation` and `sketch-edit#locking` |
| W3 | `cam-operations`, `cam-tools`, `cam-tabs-clamps`, `machine-library` | W4 supplies the strategy and `op-3d-*` anchors of `cam-operations` |
| W5 | `cam-export`, `cam-debug-view`, `sketch-export`, `sketch-toolpaths`, `view-3d`, `view-simulation`, `post-processor-converter` | W3 supplies `cam-export#machine-selection`, `#clearances` and `#custom-machines` |

The inventory already records every old anchor's destination, so no workstream has to guess. Better still, a small platform follow-up could generate the `anchors` maps from `legacy-guide-inventory.csv`. Then Wave 2 pull requests would only need the matching heading ids to exist, and `npm run verify` already fails when a mapped anchor is missing.

### Order and dependencies

1. **Before Wave 2:** #22 fixes the section slugs, page types and frontmatter in `site/config/manual-structure.mjs` ([MANUAL_BLUEPRINT.md](MANUAL_BLUEPRINT.md)). The sidebar is generated from it, so no content PR touches `astro.config.mjs`. Any renamed destination is updated here in the same change.
2. **W1 goes first or in parallel.** Every other workstream links to its fundamentals pages (roles, regions, Z range, workspace).
3. **W3 and W4 run in parallel.** W4's strategy pages are referenced from W3's operation pages, so agree the anchor ids listed in `destination` up front.
4. **W5 can start any time.** Its reference pages collect warnings and formats from the other workstreams, so finish them last.

### Release-critical versus reference

`release-critical` rows are what the next release's users need in order to complete a job safely and discover what is new:

- every operation and strategy a user can pick;
- every import and export path;
- the main views;
- CAM Plan;
- safety;
- troubleshooting.

`reference` rows are occasional or deep material that can land later without leaving a user stuck:

- warning explanations;
- machine-definition fields;
- the post-processor converter;
- themes and language packs;
- glossary, privacy, and implementation behaviour such as subtract folding.

## Open questions for #22

All four are settled in [MANUAL_BLUEPRINT.md](MANUAL_BLUEPRINT.md#settled-questions). CAM Plan is not experimental; it is labelled Preview Build until the next release.

- **Preview labelling for CAM Plan.** Its engine index calls it a POC. The compute backend's background thread is labelled experimental in the UI.
- **Quick Start location.** It stays at `/quickstart/` or moves under `/guide/start-here/`. Only its destination and redirect rows change.
- **Regions placement.** Regions are in Fundamentals here because operations, import and CAM Plan all depend on them. Their limits (`strat.xy-lead`, `ops.edge-inside`) are CAM-specific.
- **Settings placement.** Themes and languages sit under Reference here; a separate Settings group is an option.
