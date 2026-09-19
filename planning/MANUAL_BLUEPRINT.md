---
status: proposed
authoritative-for: the User Guide's structure, page types, metadata, terminology, callouts, media, URLs, availability labels, review, and Wave 2 file ownership
last-verified: 2026-09-16
---

# User Guide Blueprint

Outcome of #22, part of #23 and #24. It turns the capability inventory
([MANUAL_COVERAGE.md](MANUAL_COVERAGE.md)) into a page tree and an authoring standard that
several Wave 2 agents can follow in parallel without competing over structure or style.

Most rules here are enforced, not just written down:

| Rule | Enforced by |
| --- | --- |
| Page tree, titles, page types, owners, sidebar | `site/config/manual-structure.mjs` (sidebar in `site/astro.config.mjs`) |
| Frontmatter types | `site/src/content.config.ts`, at build time |
| Frontmatter rules, required sections, headings, callouts, images, terminology, screenshot manifest | `npm run content` (`site/scripts/check-content.mjs`) |
| Every capability has a planned page with the right owner; every planned page has a capability | `npm run coverage` (`site/scripts/check-coverage.mjs`) |
| Links, anchors, redirects, images in the built site | `npm run verify` (`site/scripts/verify-artifact.mjs`) |
| Everything written, reviewed, and current before the cutover | `npm run content:cutover` and `npm run verify:cutover` |

The app was read at `PureCutCNC/purecutcnc` `0b33a4137cac0cf6e2645c7c777339b9c17a2762`, the
same commit as the inventory.

## Decisions at a glance

| Question | Decision |
| --- | --- |
| Name | **PureCutCNC User Guide** ("User Guide" for short), not "user manual". |
| Sections | Start Here, Fundamentals, Design, CAM Setup, Machining Operations, Advanced Strategies, Verify and Export, Reference and Troubleshooting. |
| Size | 68 pages, all listed below, each owned by exactly one Wave 2 workstream. |
| Quick Start | Stays at `/quickstart/` as the only guided first project. It links to Fundamentals instead of explaining concepts twice. |
| CAM material | One page per operation, one page per strategy that more than one operation offers. Operation pages list their strategies and link to them. |
| Page types | overview, tutorial, concept, task, reference, operation, strategy, troubleshooting (plus utility for the 404 page), each with a template and required sections. |
| Versions | One unversioned guide that describes the app on `main`. Features not yet in a stable release are labelled Preview Build. No multi-version site before 1.0. |
| Safety | Only `danger` callouts, always titled "Safety: …", and a Working safely page that every CAM page can link to. |
| Legacy URLs | Every old page and anchor has a destination in `planning/legacy-guide-inventory.csv`; each workstream turns its rows into redirect entries. |
| Screenshots | Dark theme, English, recorded app commit, viewport and fixture, one folder per page, listed in `media.json`. App fixes that block a screenshot are recorded in `blockedBy`. |

## Audiences and reading paths

| Reader | What they need | Path through the guide |
| --- | --- | --- |
| **First-time user** with a CNC router and a first part to make | A complete project from blank canvas to G-code, then enough background to make their own | Guide overview → Install and open → Quick Start → Working safely → Fundamentals, in order → the operation pages the Quick Start used |
| **Returning user looking something up**: one tool, operation, parameter, or shortcut | The exact field, its units and default, and what it changes in the cut | Search, or the sidebar → an operation, strategy, or reference page → the parameter table |
| **User switching from another CAM program** | How PureCutCNC names and models things they already know | Glossary → Features, roles, and depth → Choosing an operation → Advanced Strategies |
| **User troubleshooting** an import, toolpath, simulation, or export | The symptom, why it happens, and the fix | Troubleshooting (grouped by where the problem shows) → Warnings and messages (the exact text the app shows) → the page that explains the setting |
| **User preparing to cut** | A checklist of what to verify and what the preview cannot tell them | Working safely → each operation's Verifying the result → Simulation → Exporting G-code |

Every page answers one of these readers. The guide overview routes the first four; each
section overview routes within its section.

## Page tree

`site/config/manual-structure.mjs` is the source; the tables below are generated from it
and must be regenerated when it changes. The sidebar shows each section's pages in this
order, as soon as their files exist. Owners are the Wave 2 workstreams from
[MANUAL_COVERAGE.md](MANUAL_COVERAGE.md#recommended-wave-2-issues).


#### Start Here (`start-here`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| PureCutCNC User Guide | `/guide/` | overview | W1 |
| Quick Start | `/quickstart/` | tutorial | W1 |
| Install and open PureCutCNC | `/guide/start-here/install-and-open/` | task | W1 |
| Working safely | `/guide/start-here/safety/` | concept | W1 |

#### Fundamentals (`fundamentals`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| The workspace | `/guide/fundamentals/workspace/` | concept | W1 |
| Projects and files | `/guide/fundamentals/projects-and-files/` | task | W1 |
| Features, roles, and depth | `/guide/fundamentals/features-and-roles/` | concept | W1 |
| Feature tree and properties | `/guide/fundamentals/feature-tree/` | reference | W1 |
| Linked features | `/guide/fundamentals/linked-features/` | concept | W1 |
| Stock, origin, and units | `/guide/fundamentals/stock-origin-units/` | task | W1 |
| Regions | `/guide/fundamentals/regions/` | concept | W1 |
| Construction geometry | `/guide/fundamentals/construction-geometry/` | concept | W1 |
| Tablet and touch | `/guide/fundamentals/tablet-and-touch/` | reference | W1 |

#### Design (`design`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| Drawing tools | `/guide/design/drawing-tools/` | task | W2 |
| Slots, polygons, and gears | `/guide/design/parametric-shapes/` | task | W2 |
| Text | `/guide/design/text/` | task | W2 |
| Selecting and transforming | `/guide/design/selecting-and-transforming/` | task | W2 |
| Aligning and distributing | `/guide/design/arranging/` | task | W2 |
| Offset, join, and cut | `/guide/design/shape-operations/` | task | W2 |
| Editing sketches | `/guide/design/sketch-editing/` | task | W2 |
| Snapping and the grid | `/guide/design/snapping-and-grid/` | reference | W2 |
| Dimensions and constraints | `/guide/design/dimensions-and-constraints/` | task | W2 |
| Importing SVG, DXF, and projects | `/guide/design/importing-2d/` | task | W2 |
| Importing 3D models | `/guide/design/importing-3d-models/` | task | W2 |
| Backdrop images | `/guide/design/backdrop-images/` | task | W2 |

#### CAM Setup (`cam-setup`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| Tool library | `/guide/cam-setup/tool-library/` | reference | W3 |
| Working with operations | `/guide/cam-setup/working-with-operations/` | task | W3 |
| CAM Plan | `/guide/cam-setup/cam-plan/` | task | W3 |
| Machines | `/guide/cam-setup/machines/` | task | W3 |
| Tabs | `/guide/cam-setup/tabs/` | task | W3 |
| Clamps and clearances | `/guide/cam-setup/clamps-and-clearances/` | task | W3 |

#### Machining Operations (`operations`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| Choosing an operation | `/guide/operations/` | overview | W3 |
| Common operation parameters | `/guide/operations/common-parameters/` | reference | W3 |
| Pocket | `/guide/operations/pocket/` | operation | W3 |
| Surface clean | `/guide/operations/surface-clean/` | operation | W3 |
| Edge route inside | `/guide/operations/edge-route-inside/` | operation | W3 |
| Edge route outside | `/guide/operations/edge-route-outside/` | operation | W3 |
| V-carve offset | `/guide/operations/v-carve-offset/` | operation | W3 |
| V-carve medial | `/guide/operations/v-carve-medial/` | operation | W3 |
| Engrave | `/guide/operations/engrave/` | operation | W3 |
| Drill | `/guide/operations/drill/` | operation | W3 |
| 3D surface rough | `/guide/operations/3d-surface-rough/` | operation | W4 |
| 3D surface finish | `/guide/operations/3d-surface-finish/` | operation | W4 |
| 3D surface cleanup | `/guide/operations/3d-surface-cleanup/` | operation | W4 |

#### Advanced Strategies (`strategies`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| Clearing patterns | `/guide/strategies/clearing-patterns/` | strategy | W4 |
| Trochoidal cutting | `/guide/strategies/trochoidal-cutting/` | strategy | W4 |
| Entry and exit moves | `/guide/strategies/entry-and-exit/` | strategy | W4 |
| Corner rounding and relief | `/guide/strategies/corners/` | strategy | W4 |
| Feed reduction | `/guide/strategies/feed-reduction/` | strategy | W4 |
| Rest machining | `/guide/strategies/rest-machining/` | strategy | W4 |
| 3D finishing controls | `/guide/strategies/3d-finishing/` | strategy | W4 |

#### Verify and Export (`verify-export`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| Toolpath preview | `/guide/verify-export/toolpath-preview/` | reference | W5 |
| 3D view | `/guide/verify-export/3d-view/` | reference | W5 |
| Simulation | `/guide/verify-export/simulation/` | task | W5 |
| Exporting G-code | `/guide/verify-export/gcode-export/` | task | W5 |
| Exported motion inspector | `/guide/verify-export/exported-motion/` | reference | W5 |
| Setup booklets | `/guide/verify-export/setup-booklets/` | task | W5 |
| Exporting models and printing | `/guide/verify-export/model-export-and-print/` | task | W5 |

#### Reference and Troubleshooting (`reference`)

| Page | URL | Type | Owner |
| --- | --- | --- | --- |
| Keyboard shortcuts | `/guide/reference/keyboard-shortcuts/` | reference | W1 |
| File formats | `/guide/reference/file-formats/` | reference | W5 |
| Machine definition reference | `/guide/reference/machine-definitions/` | reference | W5 |
| Post-processor converter | `/guide/reference/post-processor-converter/` | reference | W5 |
| Themes and appearance | `/guide/reference/themes/` | reference | W1 |
| Interface languages | `/guide/reference/languages/` | reference | W1 |
| Warnings and messages | `/guide/reference/warnings/` | reference | W5 |
| Troubleshooting | `/guide/reference/troubleshooting/` | troubleshooting | W5 |
| Glossary | `/guide/reference/glossary/` | reference | W1 |
| Privacy and data | `/guide/reference/privacy-and-data/` | reference | W1 |

### What gets its own page

A subject gets its own page when at least one of these is true:

- the app shows it as a separate operation, dialog, view, or tab;
- more than one page needs to link to it as a whole;
- a reader would search for it by name and expect a page, not a heading;
- its content would take more than about 1,500 words as a section.

Otherwise it is a section (`##`) on the page that owns the surrounding workflow. In
particular:

- **Strategies.** A strategy that more than one operation offers gets a strategy page. A
  strategy that only one operation offers is a section of that operation's page, which is
  why the drill types (simple, peck, dwell, chip breaking, helical, countersink) live on
  **Drill**.
- **Settings groups.** An operation's property groups are sections of its page, not pages.
  Fields shared by every operation are described once, in Common operation parameters.
- **Panels and dialogs.** A dialog that belongs to one task is a section of that task's
  page (for example, the tool import dialog on Tool library).

New pages, renamed pages, and moved pages are information-architecture changes: they are
made in `manual-structure.mjs`, in a pull request of their own or clearly called out in a
content pull request, with a redirect for any URL that has been published.

### Quick Start and the guide

The Quick Start stays at `/quickstart/`, its published URL, and is listed first under
Start Here. It is the only guided walk-through of the whole workflow: other pages do not
repeat it step by step. It explains only what its steps need and links to Fundamentals
(features and roles, Z top and Z bottom, stock) for the rest, and those pages do not
restate its steps. Its `## Next steps` section routes readers into the guide.

### Operations and strategies

The legacy Operations page mixed an operation catalogue, every parameter table, and six
strategy essays. It splits into three page families:

1. **Choosing an operation** (`/guide/operations/`): which operation does what, which
   features and tools each one accepts, and a decision table.
2. **One page per operation**, named exactly as the app's **Kind** field names it: Pocket,
   Surface clean, Edge route inside, Edge route outside, V-carve offset, V-carve medial,
   Engrave, Drill, 3D surface rough, 3D surface finish, 3D surface cleanup. Common
   operation parameters holds the fields they all share.
3. **One page per shared strategy** under Advanced Strategies.

Strategies are ways of cutting that an operation offers; they are not operations. Each
operation page has a `## Strategies` section (when it offers any) that names exactly the
strategies the app offers for it and links to where each is documented, without
documenting the strategy again. Each strategy page has a `## Where it applies` table that
lists the operations offering it. Both lists come from the app, not from memory:

| Strategy family | Offered by (app at `0b33a41`) | Documented on |
| --- | --- | --- |
| Clearing patterns: **Offset**, **Seeded circles**, **Parallel** | Pocket, Surface clean, 3D surface rough, 3D surface cleanup (`OPERATION_PATTERN_SUPPORT`) | Clearing patterns |
| **Trochoidal** clearing | Pocket, Surface clean, 3D surface rough | Trochoidal cutting |
| **Trochoidal** edge routing and **Trochoidal (slot)** engraving | Edge route inside and outside; Engrave | Trochoidal cutting |
| Finishing patterns: **Parallel**, **Waterline**, **Constant scallop** | 3D surface finish | 3D finishing controls |
| Entry, XY approach and exit | Per `operationFields.ts` | Entry and exit moves |
| Round corners, corner relief | Per `operationFields.ts` | Corner rounding and relief |
| **Feed reduction** | Per `operationFields.ts` | Feed reduction |
| **Create rest operation** | Pocket and edge routes | Rest machining |
| Drill types | Drill | Drill (sections) |

The anchors that operation pages link to are the ones in the `destination` column of
`planning/manual-coverage.csv` (for example `/guide/strategies/trochoidal-cutting/#clearing`),
so W3 and W4 can link to each other before both pages exist. `npm run verify` warns about
links to planned pages that are not written yet, and `verify:cutover` fails on them.

### Exclusions

Every row in `planning/manual-coverage.csv` has a destination page. These parts of the app
are deliberately left out of the guide:

| Not documented | Why |
| --- | --- |
| The **Debug toolpath** checkbox in the CAM panel | Development builds only (`CAMPanel.tsx`, `import.meta.env.DEV`). The Exported motion inspector does not need it. |
| The shell-mode indicator in the status bar | Development builds only (`AppShell.tsx`). |
| The `#icons` sprite gallery | Development builds only (`main.tsx`, `IconGallery.tsx`). |
| The `?toolpathRenderer=` override | Development builds only (`toolpathRendererPreference.ts`). |
| The AI assistant panel | A placeholder that is not mounted anywhere (`src/components/ai/`). |
| The `ai_history` project field | Always empty. File formats may list it as reserved, nothing more. |

If one of these ships to users, it gets a row in the coverage matrix and a destination
like any other capability.

## Page types and templates

Each page type has a template in `site/templates/<type>.mdx`. Copy it, keep the required
sections in order, and delete the guidance comments. `npm run content` checks that the
required `##` sections are present, in this order, and that the last one comes last.

| Type | Use for | Required `##` sections, in order | Optional sections |
| --- | --- | --- | --- |
| overview | The guide and section landing pages | none | any |
| tutorial | A guided project with a visible result | …, Next steps | Before you start |
| concept | How part of the app works, so the reader can decide | …, Related pages | any |
| task | Doing one thing, in steps | …, Related pages | Before you start, Troubleshooting |
| reference | Complete, scannable facts: settings, shortcuts, formats | …, Related pages | any |
| operation | One machining operation | Requirements, Parameters, …, Verifying the result, Related pages | Strategies, Limitations, Troubleshooting (between Parameters and Verifying the result) |
| strategy | One way of cutting that several operations offer | How it works, Where it applies, Settings, Limitations, Related pages | Troubleshooting |
| troubleshooting | Symptoms, causes, and fixes | …, Related pages | none |
| utility | The 404 page | none | none |

How the issue's template elements map onto these:

| Element | Where it goes |
| --- | --- |
| Purpose and prerequisites | The lead paragraph, plus Requirements (operations) or Before you start (tasks, tutorials) |
| Supported targets and tools | Requirements |
| Procedural steps | Starlight `Steps`, in task and tutorial pages |
| Parameter reference | Parameters (operations), Settings (strategies), or tables in reference pages |
| Verification | Verifying the result |
| Safety notes and limitations | `danger` callouts where the risk arises; Limitations with `caution` callouts |
| Troubleshooting | An optional Troubleshooting section, and the Troubleshooting page for problems that cross pages |
| Related pages | Related pages, always last: a list of links, each with a reason to follow it |
| App commit reviewed | `reviewed.appCommit` in the frontmatter |

### Writing rules the checker applies

- The title is the only level-1 heading; sections start at `##` and never skip a level.
- Headings are plain text: no components, badges, or code. Heading text becomes the anchor
  that other pages and redirects use, so don't rename a published heading without adding
  a redirect anchor.
- Headings are unique within a page.
- Images use the `Screenshot` component, imported from the page's own asset folder. No
  Markdown image syntax and no `<img>`.
- Callouts use the `Aside` component, not `:::` directives.

## Frontmatter

```yaml
---
title: Pocket                     # exactly as in manual-structure.mjs
description: Clear the inside …   # one sentence, at most 170 characters; used by search and link previews
pageType: operation               # exactly as in manual-structure.mjs
availability: stable              # stable | preview | experimental
status: reviewed                  # draft | reviewed
reviewed:                         # required when status is reviewed, forbidden otherwise
  appCommit: 0b33a4137cac0cf6e2645c7c777339b9c17a2762   # full SHA of PureCutCNC/purecutcnc
  date: 2026-09-20
  by: reviewer name or GitHub handle
---
```

- `title`, `description`, `pageType`, `availability`, and `status` are required on every
  page.
- Guide pages do not set `banner` or `sidebar`: the draft and availability notices under
  the title are generated, and the sidebar comes from the page tree.
- `tableOfContents: false` is allowed on overview pages. Other Starlight fields need a
  reason in the pull request.

## Terminology and capitalization

**UI labels.** Write every label the app shows in bold, spelled and capitalized exactly as
in the English catalogue (`src/i18n/locales/en/` in the app) at the reviewed commit:
**Import from library…**, **Max cut depth**, **Entry & retract**. Use `>` for paths through
menus and groups: **Entry & retract** > **Entry strategy**. If the app changes a label,
the page changes with it.

**When the app is wrong.** The guide writes labels and text as they should read, but it
documents behaviour as the app has it today:

- **A wrong or inconsistent label or UI text:**
  - file an app issue;
  - write the corrected label in the guide;
  - list the issue in `blockedBy` for every screenshot that shows the old wording.

  The checker applies such corrections to bold labels too. Today that covers **V-bit** and
  **Z top** / **Z bottom** (PureCutCNC/purecutcnc#797).
- **Missing or wrong behaviour:**
  - file an app issue;
  - describe what the app does now, never the intended behaviour as if it had shipped (#24);
  - if the difference matters to the reader, say so in a `caution` callout;
  - update the page when the fix ships.

**Titles and headings** use sentence case. The proper names that keep their capitals are
**PureCutCNC**, **User Guide**, **Quick Start**, **CAM Plan**, **Preview Build**, and
product names such as GRBL, grblHAL, LinuxCNC, Mach3, and UCCNC. Section labels in the
sidebar are title case, as the issue set them.

**Terms.** In prose (outside bold UI labels and code), use these spellings. The checker
flags the common alternatives.

| Write | Not |
| --- | --- |
| PureCutCNC | PureCut CNC, Pure Cut, Purecut |
| User Guide | user manual |
| G-code | G-Code, Gcode, GCode |
| toolpath | tool path |
| stepover, stepdown | step over, step-over, step down |
| endmill, flat endmill, ball endmill | end mill |
| V-bit | V-Bit, Vbit, also in labels (bundled tool names such as `60° V-Bit` keep their spelling) |
| V-carve | V-Carve, Vcarve |
| Z top, Z bottom | Top Z, Bottom Z, ZTop, also in labels |
| Preview Build | preview build |
| click | click on |
| for example, that is | e.g., i.e. |

**Other conventions.**

- Operations are named as the **Kind** field names them, capitalized as a label when bold
  and lowercase in running prose where it reads naturally ("add a pocket").
- Feature roles are lowercase in prose: add, subtract, region, model, line, construction.
- Units: a space between number and unit (`6 mm`, `0.25 in`). Fractional inch sizes in
  prose use the double prime (1/4″ endmill); tool names in bold keep the app's spelling
  (**1/4" Endmill**). Show both unit systems when a value is a recommendation.
- Keyboard keys use `<kbd>`: <kbd>Ctrl</kbd>+<kbd>Z</kbd>, with the macOS key in the
  Keyboard shortcuts page.
- Avoid release-note phrasing ("now", "new", "no longer"). Describe the app as it is.

## Callouts

| Callout | Use for | Title |
| --- | --- | --- |
| `note` (default `Aside`) | Background the reader may need, not a warning | Optional |
| `tip` | A faster or better way to do something | Optional |
| `caution` | A limitation, a fallback, or a setting that can give a wrong or poor result | Required: states the limitation |
| `danger` | Risk of injury, machine damage, or a crash: anything that can go wrong once the machine runs | Required, starting with **Safety:** |
| Draft notice | Generated for `status: draft` | Generated |
| Availability notice | Generated for `availability: preview` or `experimental` | Generated |
| `Availability` badge | A preview or experimental section on an otherwise stable page, on its own line under the heading | Generated |

Safety rules:

- A `danger` callout sits right where the risk arises (for example, next to the setting
  that moves the tool through clamps), not collected at the end.
- It says what can happen and what to check, in that order, in two or three sentences, and
  links to Working safely for the general practice (dry runs, workholding, verifying G-code).
- Every operation page ends its Verifying the result section with what the preview and
  simulation cannot tell the reader.
- W3 and W4 claims about how a toolpath cuts are technically reviewed before `status:
  reviewed` (see *Review*).

`npm run content` rejects a `danger` callout without a "Safety: …" title.

## Stable and preview features

The guide is a single, unversioned site that describes the app on `main` (the build at
`/app-rc/`), because the site is deployed together with the next release and the app ships
new features between releases.

- `availability: stable` means the feature is in the latest stable release (`/app/` and
  the stable desktop builds).
- `availability: preview` means it is only in the Preview Build. The page shows a Preview
  Build notice. Inside a stable page, a preview section carries the `Availability` badge
  under its heading.
- `availability: experimental` is only for features the app itself labels experimental,
  such as the **Background thread (experimental)** generation option. The notice asks
  readers to check results more carefully. CAM Plan is not experimental: it is `preview`
  until the next release, then `stable`.
- When a release ships, one pull request switches the released features' pages and
  sections to `stable`. This is a step in the release playbook, and #24's release
  integration does it for the release that goes out with the cutover.
- Multi-version documentation is not warranted now: there is one stable line, the app
  updates itself, and each version's differences are small enough to label. Revisit at
  1.0, or when a stable release has to be supported alongside a newer one.

`planning/manual-coverage.csv` marks what changed since v0.4.0 (`since_v040`); those rows are
the ones to check for `preview` until the next release.

## Screenshots and diagrams

| Aspect | Standard |
| --- | --- |
| Location | `site/src/assets/manual/<page folder>/`, where the folder is the page's path under `/guide/` (`operations/pocket`, `quickstart`, `guide-overview` for `/guide/`, `<section>/index` for a section overview). A page imports images only from its own folder. |
| Names | Lowercase kebab case, describing the subject, not the step number: `import-dialog.png`, `seeded-circles.png`. |
| Format | PNG for UI captures; SVG for diagrams; WebP or JPEG only for photographs. The build generates responsive sizes. |
| App state | Default **Dark** theme, English interface, default panel layout, no personal files or paths visible. |
| Viewport | Desktop captures in a 1440 × 900 window at 2× scale (`1440x900@2x`). Tablet captures, only on tablet pages, at 1180 × 820 at 2×. |
| Cropping | Crop to the part that matters, with a little context so the reader can find it. Use `maxWidth` for dialogs and panels so they are not upscaled. Draw on a capture only where the annotation carries what prose cannot — numbered callouts that name regions, or a marked dimension span. Keep that style consistent: white markers, dark chips, no leader lines crossing. Never add arrows or boxes as decoration, or in place of a sentence that would do the job. |
| Source | Captured from a committed fixture project at a recorded app commit, so a screenshot can be retaken. Fixtures live in `site/fixtures/` (created with the first capture), or are named as `app:<path>` for a file in the app repository at that commit. |
| Diagrams | SVG, using the site's colour tokens, with text as real text. The SVG source is the asset. |
| Alt text | Required (the build fails without it). Say what the image shows that matters for the page, in one or two sentences; don't start with "Screenshot of". Purely decorative images are not used. |
| Captions | Optional; use one when the image needs a sentence of context the prose does not give. |

Every image has an entry in `site/src/assets/manual/media.json`, keyed by its path under
`src/assets/manual/`:

```json
"operations/pocket/offset-toolpath.png": {
  "shows": "Pocket toolpath with offset rings inside a closed profile",
  "source": "capture",
  "appCommit": "0b33a4137cac0cf6e2645c7c777339b9c17a2762",
  "fixture": "site/fixtures/pocket.camj",
  "viewport": "1440x900@2x",
  "theme": "dark",
  "locale": "en",
  "status": "current",
  "blockedBy": []
}
```

- `source` is `capture`, `diagram`, or `legacy-guide` (carried over from the old guide;
  always `status: reshoot`).
- `status` is `current` or `reshoot`. A capture needs `appCommit`, `fixture`, and
  `viewport`.
- `blockedBy` lists issues (`owner/repo#number`) that must be fixed in the app before the
  screenshot can be taken correctly, for example `PureCutCNC/purecutcnc#795`. The page
  already uses the corrected wording (see *When the app is wrong*); the screenshot waits.
- `npm run content` prints the re-shoot count and every blocked image;
  `npm run content:cutover` fails while any image is `reshoot` or blocked.

### Visual decisions before capture

`planning/manual-visual-inventory.json` is the canonical visual queue. Every planned page has
one explicit decision:

- `visuals`, with one or more screenshot or diagram entries; or
- `not-needed`, with a rationale and a human review state.

An agent-authored entry begins as `proposed`. The page renders
`<VisualPending id="…" />` at the suggested location, showing the capture brief and why the
visual would help. During content review, the reviewer may accept, move, rewrite, split, or
remove the suggestion. An accepted visual becomes `planned`; a text-only decision becomes an
approved `not-needed` decision. `blocked` entries name the app issue that prevents an accurate
capture. Only a final asset with matching current `media.json` provenance becomes `captured`.

Content review and visual completion are separate dimensions. Page frontmatter may record
`status: reviewed` while an accepted visual is still pending; the unresolved marker remains
visible and the page is not cutover-ready. `npm run content` validates decisions, ids, page and
heading placement, markers, asset folders, and captured metadata. `npm run content:cutover`
rejects every proposed, planned, blocked, legacy re-shoot, or unapproved text-only decision.

Every new or materially revised manual page must update the visual inventory in the same pull
request. Do not silently omit a visual decision, and do not treat an agent proposal as product
verification.

Wave 3 produces the final captures from the fixtures, as #24 plans.

## Accessibility

- Every image has alt text, as above; a diagram's alt text gives its conclusion.
- Information is never carried by colour alone. When the app uses colour (feed colours,
  toolpath move types), the text names the colours and what they mean.
- Link text says where it goes: "see [Clearing patterns](…)", never "click here".
- Tables have a header row, and their first column identifies the row.
- Heading levels are not skipped, so screen-reader navigation works (checked).
- Keyboard instructions are given alongside pointer instructions where the app supports
  both; touch gestures are on the Tablet and touch page.
- No text in images other than the app's own UI.
- Pages keep a Lighthouse accessibility score of 100, as #20 measured on the Tool library
  sample page.

## URLs and redirects

- A page's URL is its path in the page tree: lowercase, kebab case, at most two levels under
  `/guide/`, with a trailing slash.
- Anchors are the slugs Starlight generates from heading text. Pages keep an old anchor by
  keeping heading text that slugifies to it, or by mapping it in `legacy-routes.mjs`.
- Every URL and anchor of the old guide has a destination in
  `planning/legacy-guide-inventory.csv`. When a workstream's page replaces a legacy page, it
  updates that page's entry in `site/config/legacy-routes.mjs` in the same pull request:
  set `to`, add `anchors` for every old anchor whose destination differs from
  `to` + `#anchor`, and remove `pending`. The owners of each entry are listed in
  [MANUAL_COVERAGE.md](MANUAL_COVERAGE.md#redirect-entries).
- If a page's heading does not produce the anchor the inventory planned, update the
  inventory row in the same pull request. `npm run verify` fails when a redirect points at a
  missing anchor.
- A published URL is never removed. A renamed or moved page gets a redirect.
- Pages link to new URLs, never to legacy `.html` URLs (`verify` warns now,
  `verify:cutover` fails).

## Review

1. A page is written as `status: draft`. It is published on the preview build with a Draft
   notice.
2. The author checks every claim, label, and default against the app at a specific commit,
   using the evidence listed for its rows in `planning/manual-coverage.csv`, and updates
   those rows (`coverage: accurate`).
3. A reviewer from the row's `reviewer` column reads the page against the app, including
   each image's alt text against the image itself. W3 and W4
   pages need a CAM toolpath or post/G-code reviewer, because they carry safety-sensitive
   claims.
4. The page switches to `status: reviewed` with `reviewed.appCommit` (full SHA),
   `reviewed.date`, and `reviewed.by`.
5. A later change to the page's content keeps `reviewed` only if it was checked against a
   newer commit, which it then records.

Before the cutover, every planned page exists and is reviewed (`npm run content:cutover`).

## Wave 2 ownership

A workstream owns:

- the page files of the pages whose `owner` it is in `manual-structure.mjs`;
- those pages' asset folders under `site/src/assets/manual/` and their `media.json` entries;
- its rows in `planning/manual-coverage.csv` and `planning/legacy-guide-inventory.csv`;
- its legacy pages' entries in `site/config/legacy-routes.mjs`
  ([MANUAL_COVERAGE.md](MANUAL_COVERAGE.md#redirect-entries)); where another workstream
  supplies an anchor, that workstream adds the one `anchors` line.

Shared files belong to the platform and change only in their own pull requests:
`site/config/manual-structure.mjs`, `site/astro.config.mjs`, `site/src/content.config.ts`,
`site/src/components/`, `site/src/styles/`, `site/templates/`, and `site/scripts/`. A
content pull request that needs one of them changed says so, and the change lands first.

`media.json` and the two CSV files are edited by several workstreams. Keep edits to your own
entries and rows, keep the existing order, and rebase rather than resolve conflicts by hand.

## App follow-ups

App issues filed while defining the guide. Both are text issues, so the guide already uses
the corrected wording, and the affected screenshots wait on them through `blockedBy`:

- PureCutCNC/purecutcnc#795: operation descriptions list incomplete strategy choices.
- PureCutCNC/purecutcnc#797: the tool type label **V-Bit**, and **Top Z** / **Bottom Z** in
  CAM Plan and the setup booklet, disagree with **V-bit** and **Z top** / **Z bottom**
  elsewhere.

## Settled questions

- **CAM Plan** is not experimental. It is `preview` until the next release.
- **Experimental** is used only where the app labels a feature experimental.
- **Quick Start** stays at `/quickstart/`.
- **Regions** stay in Fundamentals, with their CAM-specific limits on the strategy pages
  that use them.
- **Themes and Interface languages** stay under Reference.

The theme of the marketing pages is still open in
[SITE_PLATFORM.md](SITE_PLATFORM.md#open-questions); it does not affect the guide.
