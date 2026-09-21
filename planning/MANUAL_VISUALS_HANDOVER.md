# Illustrating the manual — handover

Written partway through the CAM work, for whoever picks this up next. It assumes
you have read `MANUAL_BLUEPRINT.md`, which is the standard; this is what the
standard does not tell you, learned by getting it wrong.

## Where things stand

Counts come from `npm run content`, which prints them.

| Section | State |
| --- | --- |
| Design | 40 of 40. Complete. |
| Fundamentals, Start Here, Quick Start | Complete. |
| CAM setup | 9 of 9. Complete. |
| Machining operations | 25 of 28. Three left, all noted below. |
| Strategies | 14 of 14. Complete. |
| Verify & export | 11 of 11. Complete. |
| Reference | 7 of 7. Complete. |

`npm run content` reports 135 captured, 3 proposed, 1 legacy re-shoot.

Inline app icons are done: 124 of them, across Design, the three Fundamentals
pages the old `interface.html` spilled into, and the keyboard reference.

The five legacy 3D screenshots that used a non-free model have been replaced.

## The loop

The dev servers are the user's and must not be stopped: the app on
`http://localhost:1420`, the docs preview on `http://localhost:4321`.

1. Read the brief in `planning/manual-visual-inventory.json`.
2. Add a recipe to `site/scripts/capture-visuals.mjs`.
3. `npm run capture -- --only <id>` — one recipe, a few seconds.
4. **Look at the image.** Then show it to the user before wiring it in.
5. Wire it: replace the `<VisualPending>` with a `<Screenshot>`, set the
   inventory status to `captured`, add the `media.json` record.
6. `npm run ci`.

Review images in batches. Building one contact sheet — scale several PNGs with
`sips -Z`, lay them out in an HTML grid, screenshot it with Playwright — costs
one image read instead of six, and the loop is where the context goes.

## Things that will waste your time

**The canvas drops clicks.** Pervasive. Use `clickUntil`, which retries until the
workflow panel's text changes. It cannot be used for repeated polygon points,
because the panel stops changing after the second point; those need plain spaced
clicks or a check against the feature tree.

**Match on what the app actually exposes, not on what it looks like.** Three
separate bugs, all silent, all the same mistake:

- The viewport legend reports state through `aria-pressed`. There is no "off"
  class. Testing the class name left every toggle untouched, and the failure
  looked like a rendering problem.
- Properties labels are not tied to their inputs, so finding an input by its
  label text writes to whichever box comes first. `Z top` and `Z bottom` have
  their own classes (`.z-range-slider__field--top`). Set the value, then read it
  back and throw if it did not land.
- The Add-operation menu's rows are `.cam-operation-item`. Walking up from a
  label reaches the whole menu, where the first button matching your pass belongs
  to a different operation — asking for Surface produced an Engrave, because
  Surface offers Rough/Finish/Both and has no Add button. Scope to the row, and
  when the pass is missing, list what the row does offer.

**Some clicks must be real.** `element.click()` inside `page.evaluate` does
nothing for controls that listen for pointer input — **Add clamp**, and the
options in the properties panel's custom dropdowns. The dropdown case was the
worst, because it failed silently: the menu closed, the value did not change, and
two screenshots came out identical without any error. Use Playwright's click, and
read the value back afterwards. The reverse is
also true: buttons that only appear on row hover need the JS click, or the
visibility check stalls. `Open project` builds a transient file input, so drive
it with `page.waitForEvent('filechooser')`.

**Enter commits and closes panels.** Fill fields; do not press Enter.

**Names in the feature tree are truncated.** Selecting a feature by exact text works
until the name is long enough to be cut off, and then it misses intermittently — the Add
menu opens on no selection and complains about the operation instead. Match the tree row
by substring.

**Two recipes must not share an id or an asset.** They fight over one file, the loser's
work vanishes, and the symptom is an image of the wrong project. The script now refuses
to run when that happens; the guard exists because it cost an hour.

**Stay at 1440x900.** It is the blueprint standard, and at viewport heights near
1080 canvas clicking breaks.

**Scope operation selection to the CAM panel.** The feature tree lists the operations as
well, and clicking a name there leaves the properties panel on "Select an operation to
edit its parameters" — which reads like the click missed. `selectOperation` now scopes to
`.panel-right`.

**A generated rest operation is already selected.** `Create rest operation` selects the
operation it made, so clicking it deselects it, and the properties panel empties. Do not
select it again; read its controls straight away.

**Read the defaults before writing `setUiSelect`.** The call fails with "no dropdown
currently showing X", which reads like a broken selector but usually means the control
already holds a different value. 3D surface finish starts on **Parallel**, not Waterline;
an operation with no tool shows **No tool**, not None; an edge route's own Strategy starts
on **Contour**.

**Properties groups are `.disclosure-section__header` buttons** with `aria-expanded`.
Clicking a group that is already open closes it, so check the attribute first —
`openPropertiesGroup` does.

**Some UI is not what its role suggests.** The theme and language manager lists are
`role="option"` inside a listbox, so `getByRole('button', …)` never finds them and the
failure is a 30-second timeout rather than an error.

## Making an image worth looking at

**The subject matters more than the recipe.** The clearest example: the
PureCutCNC project's pocket is a thin border around lettering and *cannot* show
nested clearing rings, however well you frame it. The guitar body's pickup
cavities show them immediately. Before tuning a recipe, ask whether the project
can demonstrate the thing at all.

**Zoom.** The default view fits the whole stock, which leaves a toolpath a few
pixels wide. `zoomTo` scrolls in on a point; `simulateResult` takes a `zoom`
option. Two or three steps is usually right, five is too deep.

**Toolpath and result are different questions.** The toolpath shows what the app
computes, the Simulation view shows what it leaves. Operation pages carry both.
`simulateResult` handles the details: the Simulation view already sits at the
last toolpath level so nothing has to be played, scope goes to **Selected** so
the cut belongs to one operation, and Detail must be raised to about 1200,
because the default renders pocket walls as coarse steps.

**Put the pair together.** A toolpath at the top of the page and its result under
"Verifying the result" are forty lines apart, and the page reads as having one image.
Both go under the intro, toolpath first.

**Some operations only make sense on top of what came before.** A V-carve runs inside a
pocket that has already been cleared; simulated on its own it floats on untouched stock.
Pass `through` to simulateResult with the operations that precede it, and it switches the
simulation to its Visible scope.

**Check what the page already imports.** Several assets were also imported under an older
name left from the legacy guide, so overwriting the file made the same picture render
twice. Worth grepping for duplicate imports of one asset after any batch.

**Match the asset path in the inventory exactly.** The inventory is the source of truth;
a recipe that writes a differently named file fails validation rather than silently
diverging.

**Some things cannot be photographed.** A drilling toolpath is vertical moves,
which a top view draws as points — the holes only appear in simulation, and the
rapids between them are what show the order. Transient states (generating,
paused) have no still. Smooth versus Rectangular tabs differ only in Z motion.

**Ask the fixture whether it can show the thing at all**, before tuning the framing. Three
from this batch, each of which failed silently or nearly so:

- The teardrop pocket in `cam-demo` is smooth enough that a 1/4" endmill clears all of it,
  so **Create rest operation** answers "No unreachable pocket areas found for this tool"
  and makes nothing. The guitar body's cavities have corners, and generate eighteen
  regions.
- A smooth pocket runs at one engagement nearly everywhere, so **Feed colours** paints the
  whole path one colour and the picture says nothing. Corners are where the feed drops.
- Surface clean has no **Toolpath level** rail at all — its levels are not planar cut
  depths — so the rail shots have to run on an edge route.

**No bundled fixture produces an operation warning.** Every operation in both examples and
in `cam-demo` generates cleanly, so a shot that wants a warning beside it has to
manufacture one, the way the clamp-collision recipe does. A brief that asks for "a
representative warning" in passing is better corrected than faked.

**A state the app only reaches on other hardware can still be captured.** The WebGL
troubleshooting shot refuses every `webgl` context from an `initScript`, which is what a
machine without WebGL2 does; the 2D canvas is left alone, so the rest of the app keeps
working in shot. `initScript` on a recipe runs before the page loads.

**Briefs over-specify.** Several ask for more than one 1440x900 frame holds, or
for states that do not exist. Correct the brief to say where the rest of the
content is. Do not fake the shot, and do not leave a brief describing an image
nobody can take.

Corrected in this batch, and worth knowing the shape of: the toolpath legend has no
clamp-collision control (a collision is an overlay on the canvas, not a toggle); the
levels shot carries no warning, for the reason above; the WebGL shot cannot show the
Sketch workspace *beside* the failed 3D view, because they are two tabs, so it shows the
same window with the panels still working; and the Export G-code dialog only draws its
Errors and Warnings sections when it has something to say, so a healthy export has
neither.

**One asset cannot hold a three-way comparison.** `finishing-patterns` asked for
waterline, constant scallop and parallel over one surface, which is three app states. It
was split into three visuals, one under each of the headings that already explains its
pattern, framed identically and closer than the toolpath shot on the 3D surface finish
page — so they compare as the reader scrolls, and none of them duplicates that page.

**Cap panel and dialog images.** A 400px-wide panel stretched into the 800px
content column looks soft. Give every `<Screenshot>` narrower than the column a
`maxWidth` equal to its natural CSS width — the asset's pixel width halved, since
captures are 2x. A `maxWidth` larger than the image does nothing, which is easy
to miss.

## Provenance

**Never type an `appCommit`.** `npm run capture` reads the app repository's HEAD
and prints it with the other mechanical fields; copy that. A hand-written SHA
goes stale silently — the app moves on, the image is re-shot, and the record
still names the commit before the change. Set `PURECUT_APP_REPO` if the app
checkout is not beside the docs one.

**An app change can invalidate an image with no signal.** Issue #797 renamed the
`V-Bit` tool type to `V-bit` and stale-dated a screenshot taken an hour earlier.
`PureCutCNC/purecutcnc#818` asks for the harness to raise a docs issue when a PR
changes something the guide documents. Until that exists, check the app log when
you return to a section. Re-shooting is cheap: one `npm run capture` did nine.

**The fixture vocabulary is closed**, enforced by `npm run content`. `site:<path>`
is for screenshots of this site rather than the app; those record no `appCommit`.

**Legacy images exist twice** — at the repository root and under `site/public/` —
and are hash-pinned in `site/config/legacy-assets.json`. All three have to move
together or `verify-artifact` fails.

## 2026-09-21 review follow-up — merged visual and copy set

The requested strategy and verification review updates are now complete on
`docs/design-visuals` and ready to merge into `site-revamp`:

- Seeded-circle clearing and linking junctions are dedicated strategy pages, with the
  corresponding navigation order and supplied comparison captures.
- The drilling helical-bore and tangent entry/exit diagrams were corrected. Feed reduction
  now explains the transition from Slot Feed to full feed.
- Rest machining explains manual and automatic Regions for compatible 2.5D and 3D
  follow-ups, and uses the supplied large-tool / Region-limited smaller-tool comparison.
- Toolpath level filtering is documented as 2.5D-only and available in both Sketch and 3D
  views. The exported motion inspector is clearly marked as an internal debug tool.
- Exporting G-code now explains that mixed-tool selections require **Emit tool changes (M6)**;
  otherwise operations must be exported one at a time.
- Setup booklets now has a supplied Pocket Rough sample image plus a new-tab download at
  `/samples/pocket-rough-booklet.pdf`.

The user-supplied images and booklet sample have no capture recipes, so `npm run capture`
does not overwrite them. The matching fixtures are bundled under `site/fixtures/` and every
asset has current `media.json` provenance. Full `npm run ci` passed after the Rest-machining
and booklet changes; focused `npm run content` passed after the final copy updates.

## Next

**Three left in operations**, and nothing else is outstanding:

- `engrave-result` — the groove is shallow and it needs the right camera in the
  simulation; two attempts missed the curve.
- `surface-cleanup-passes` and `surface-cleanup-result` — the owner is producing these.
  Cleanup only acts on flat and vertical surfaces, so a smooth relief gives it nothing;
  `site/fixtures/cam-terrain.obj` was an attempt at suitable geometry and was not good
  enough.

**Also open:** `PureCutCNC/purecutcnc#821`, 3D surface rough leaving the top of a model
uncut — `cam-3d-surface-toolpath.png` shows that behaviour and wants re-shooting once it
is settled.

**Found while shooting Verify & export, and not yet raised:** the exported motion
inspector reports `arcDeviation` on the PureCutCNC example's Pocket Rough — four segments
at Z=0.65 deviating by up to 2.1711 against a stated tolerance of 0.0004. Pocket Rough is
the only operation in either bundled example the inspector accepts, so the page's shot is
of that warning rather than of a clean verification. A deviation four orders of magnitude
over tolerance looks like a real defect rather than a near miss; it is worth an app issue,
and the image wants re-shooting if the numbers change.

**Fixtures you already have.** `site/fixtures/cam-demo.camj` carries a relief model, a
plate inset to Z top 0.25, a teardrop pocket, two open scroll curves, four tools, and
five operations — surface clean, 3D rough, 3D finish, edge route inside and outside.
Prefer selecting those over creating new ones. `build-cam-fixture.mjs` rebuilds the
geometry and tools but **not** the operations, so do not re-run it without asking.

The number that mattered there: a surface clean needs several stepdowns of material above
the feature, not just some. At Z top 0.62 (0.13 in, about one stepdown) it still reported
no depth bands; 0.25 leaves 0.5 in and works.

## Working agreements

- Show each visual to the user before wiring it in.
- Do not commit until asked.
- No `Co-Authored-By` or "Generated with" footers.
- Dark theme, English, default panel layout, for every image.
- The user shoots 3D and simulation images where camera framing matters; their
  framing beat scripted angles decisively. Panels and dialogs script fine.
