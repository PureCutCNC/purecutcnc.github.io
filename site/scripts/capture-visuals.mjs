// Capture manual screenshots from a running PureCutCNC dev server.
//
//   npm run capture                 # every recipe
//   npm run capture -- --list       # show what is defined
//   npm run capture -- --only feature-tree-sections,stock-properties
//   PURECUT_APP_URL=http://localhost:5173/ npm run capture
//
// Each recipe reproduces one visual from planning/manual-visual-inventory.json:
// the same fixture project, viewport, panel sizes, interaction, and crop. Re-running
// a recipe should therefore reproduce the asset, which is what makes a re-shoot after
// an app change a one-line command rather than a manual session.
//
// The dev server must already be running; this script never starts or modifies it.
// Nothing here writes media.json — the prose fields there are hand-written, so the
// summary prints the mechanical fields instead and you copy across what changed.
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = join(here, '..')
const repoRoot = join(siteRoot, '..')
const assetRoot = join(siteRoot, 'src/assets/manual')
const inventoryPath = join(repoRoot, 'planning/manual-visual-inventory.json')

const APP_URL = process.env.PURECUT_APP_URL ?? 'http://localhost:1420/'

// The bundled example projects, by the name shown on their card in "Start your part".
const FIXTURES = {
	'PureCutCNC': /PureCutCNC\s+Pocket and V-Carving/s,
	'T Style guitar body': /T Style guitar body/s,
	'Badge': /Badge/s,
}

// Panel sizes are fractions of the window, stored the same way the app stores them
// when you drag a divider. 0.25 for the left column stops the tree truncating its
// own row labels ("Feat…", and Tabs/Clamps lose their label entirely at the default).
const WIDE_TREE = { 'panel-split:left-center': '0.25', 'panel-split:project-tree': '0.78' }
const SPLIT_TREE = { 'panel-split:left-center': '0.25', 'panel-split:project-tree': '0.5' }

/** Everything left of the CAM panel: tree, properties, and the canvas beside them. */
const clipWorkspaceLeft = (page) =>
	page.evaluate(() => {
		const panel = document.querySelector('.panel-left').getBoundingClientRect()
		// Bound by the CAM panel itself: there is also a divider between the left panel
		// and the canvas, so picking a divider by document order crops the canvas away.
		const cam = document.querySelector('.panel-right')?.getBoundingClientRect()
		const right = cam ? cam.x : window.innerWidth
		return {
			x: Math.round(panel.x),
			y: Math.round(panel.y),
			width: Math.round(right - panel.x),
			height: Math.round(Math.min(panel.bottom, window.innerHeight) - panel.y),
		}
	})

/** A modal plus a margin of the dimmed workspace behind it. */
const clipDialog = (selector, margin = 60) => (page) =>
	page.locator(selector).evaluate((el, m) => {
		const r = el.getBoundingClientRect()
		return {
			x: Math.round(Math.max(r.x - m, 0)),
			y: Math.round(Math.max(r.y - m, 0)),
			width: Math.round(Math.min(r.width + m * 2, window.innerWidth)),
			height: Math.round(Math.min(r.height + m * 2, window.innerHeight)),
		}
	}, margin)

/** The sketch canvas, where every Design capture happens. Its content is drawn, not DOM. */
const canvasRect = (page) =>
	page.evaluate(() => {
		const c = document.querySelector('.sketch-viewport__canvas') ?? document.querySelector('canvas')
		const r = c.getBoundingClientRect()
		return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
	})

const clipCanvas = async (page) => {
	const { x, y, w, h } = await canvasRect(page)
	return { x, y, width: w, height: h }
}

/** Points are fractions of the canvas, so a recipe survives a canvas that changes size. */
async function moveTo(page, fx, fy) {
	const { x, y, w, h } = await canvasRect(page)
	const px = x + Math.round(w * fx)
	const py = y + Math.round(h * fy)
	await page.mouse.move(px, py, { steps: 8 })
	await page.waitForTimeout(180)
	return { x: px, y: py }
}

async function clickTo(page, fx, fy) {
	const point = await moveTo(page, fx, fy)
	await page.mouse.click(point.x, point.y)
	// The canvas silently drops points that arrive too close together, so space them.
	await page.waitForTimeout(500)
	return point
}

/** Click, and keep clicking, until the workflow panel actually moves on. */
async function clickUntil(page, fx, fy, tries = 4) {
	const read = () => page.evaluate(() => document.querySelector('.canvas-workflow-panel')?.textContent?.trim() ?? '')
	const before = await read()
	for (let i = 0; i < tries; i++) {
		await clickTo(page, fx, fy)
		if ((await read()) !== before) return
		await page.waitForTimeout(300)
	}
	throw new Error(`canvas click at ${fx},${fy} never registered`)
}

/** Place a text feature. The canvas drops taps, so keep trying until it lands. */
async function placeText(page, { words, height, fx, fy }) {
	await pickShape(page, 'Add feature text')
	await page.waitForTimeout(1300)
	const dialog = page.locator('.dialog--import')
	await dialog.locator('textarea').first().fill(words)
	if (height) await dialog.locator('input[type=number]').first().fill(String(height))
	await page.waitForTimeout(400)
	await page.getByRole('button', { name: 'Place text' }).click()
	await page.waitForTimeout(900)
	const placed = () => page.evaluate((w) => (document.querySelector('.panel-content')?.innerText ?? '').includes(w), words)
	for (let i = 0; i < 5 && !(await placed()); i++) {
		await clickTo(page, fx, fy)
		await page.waitForTimeout(1400)
	}
	if (!(await placed())) throw new Error(`text "${words}" never placed`)
	await page.keyboard.press('Escape')
	await page.waitForTimeout(700)
}

/** Open the toolbar's Add dimension menu and choose one of its six types. */
async function addDimension(page, type) {
	await page.getByRole('button', { name: 'Add dimension' }).first().click()
	await page.waitForTimeout(800)
	await page.locator(`[class*=popover] button[aria-label="${type}"]`).first().click()
	await page.waitForTimeout(800)
}

/** Open the tool rail's Distribute menu and choose one of its modes. */
async function distribute(page, mode) {
	await page.getByRole('button', { name: 'Distribute selected features' }).first().click()
	await page.waitForTimeout(800)
	// Scope to the popover: a bare "Grid" also matches the status bar's grid toggle.
	await page.locator(`[class*=popover] button[aria-label="${mode}"]`).first().click()
	await page.waitForTimeout(1500)
}

/** Draw one rectangle, select it, and open its sketch edit session. */
async function editRectangle(page) {
	await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
	await page.waitForTimeout(450)
	await clickUntil(page, 0.3, 0.36)
	await clickUntil(page, 0.62, 0.62)
	await page.waitForTimeout(1000)
	await page.keyboard.press('Escape')
	await page.waitForTimeout(600)
	await clickTo(page, 0.46, 0.49)
	await page.waitForTimeout(800)
	await page.getByRole('button', { name: 'Edit sketch' }).first().click()
	await page.waitForTimeout(1300)
}

/** Choose a shape from the tool rail's shape drawer. */
async function pickShape(page, name) {
	await page.getByRole('button', { name: 'Choose feature shape' }).click()
	await page.waitForTimeout(450)
	await page.getByRole('button', { name, exact: true }).click()
	await page.waitForTimeout(500)
}

const RECIPES = [
	{
		id: 'feature-tree-sections',
		asset: 'fundamentals/feature-tree/tree-sections.png',
		fixture: 'PureCutCNC',
		// The tree needs ~940px of panel to show every section without scrolling, which
		// is taller than a 1050px screen allows. A virtual viewport has no such limit.
		viewport: { width: 1440, height: 2000 },
		storage: WIDE_TREE,
		clip: (page) =>
			page.evaluate(() => {
				const panel = document.querySelector('.panel-tree').getBoundingClientRect()
				const rows = [...document.querySelector('.panel-content').children]
				const last = rows[rows.length - 1].getBoundingClientRect()
				return {
					x: Math.round(panel.x),
					y: Math.round(panel.y),
					width: Math.round(panel.width),
					height: Math.round(last.bottom - panel.y + 12),
				}
			}),
	},
	{
		id: 'feature-tree-properties',
		asset: 'fundamentals/feature-tree/properties.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: WIDE_TREE,
		async steps(page) {
			await page.getByText('Rect 2', { exact: true }).first().click()
			await page.getByRole('button', { name: 'Expand properties panel' }).first().click()
			await page.waitForSelector('.dialog--panel-expand')
			// Both sections start collapsed, so the dialog would otherwise show no fields.
			const headers = page.locator('.dialog--panel-expand .disclosure-section__header')
			for (let i = 0; i < (await headers.count()); i++) {
				const header = headers.nth(i)
				if ((await header.getAttribute('aria-expanded')) === 'false') await header.click()
			}
		},
		clip: clipDialog('.dialog--panel-expand'),
	},
	{
		id: 'feature-tree-context-menu',
		asset: 'fundamentals/feature-tree/context-menu.png',
		fixture: 'PureCutCNC',
		// Taller than the documented viewport so the menu is not pinned against the
		// bottom edge, which would crop its last entries.
		viewport: { width: 1440, height: 1000 },
		storage: WIDE_TREE,
		steps: (page) => page.getByText('Rect 1', { exact: true }).first().click({ button: 'right' }),
		clip: (page) =>
			page.evaluate(() => {
				const menu = [...document.querySelectorAll('div,ul')]
					.filter((el) => {
						const text = el.textContent ?? ''
						return text.includes('Create operation') && text.includes('Delete') && el.children.length > 3
					})
					.pop()
				const panel = document.querySelector('.panel-tree').getBoundingClientRect()
				return {
					x: Math.round(panel.x),
					y: Math.round(panel.y),
					width: Math.round(panel.width),
					height: Math.round(menu.getBoundingClientRect().bottom + 10 - panel.y),
				}
			}),
	},
	{
		id: 'stock-properties',
		asset: 'fundamentals/stock-origin-units/stock-properties.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		steps: (page) => page.getByText('Stock', { exact: true }).first().click(),
		clip: clipWorkspaceLeft,
	},
	{
		id: 'origin-placement',
		asset: 'fundamentals/stock-origin-units/origin-placement.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		steps: (page) => page.getByText('Origin', { exact: true }).first().click(),
		clip: clipWorkspaceLeft,
	},
	{
		id: 'units-conversion',
		asset: 'fundamentals/stock-origin-units/unit-conversion.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		async steps(page) {
			await page.getByRole('button', { name: /Change project units/ }).first().click()
			await page.waitForSelector('.dialog--unit-conversion')
		},
		clip: clipDialog('.dialog--unit-conversion'),
	},
	{
		id: 'construction-geometry',
		asset: 'fundamentals/construction-geometry/construction-geometry.png',
		// The only bundled example that actually contains construction geometry.
		fixture: 'T Style guitar body',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		steps: (page) =>
			page.evaluate(() => {
				const row = [...document.querySelectorAll('.panel-content *')].find(
					(el) => el.children.length === 0 && el.textContent?.trim() === 'Construction',
				)
				row?.scrollIntoView({ block: 'center' })
			}),
		clip: clipWorkspaceLeft,
	},
	{
		id: 'tablet-workspace',
		asset: 'fundamentals/tablet-and-touch/tablet-workspace.png',
		fixture: 'PureCutCNC',
		// A touch screen with no hover is what switches the app to the tablet layout;
		// the size is an iPad-class landscape viewport.
		viewport: { width: 1180, height: 820 },
		context: { hasTouch: true },
		// Lock and Multi sit on top of the feature-colour legend at this viewport, so
		// collapse the legend rather than photograph two controls overlapping.
		steps: (page) => page.getByRole('button', { name: 'Collapse feature color legend' }).first().click(),
		clip: null, // the whole layout is the subject
	},

	// --- Design: drawing tools -------------------------------------------------
	// These draw on the empty Untitled project rather than a bundled example: a tool
	// shot wants nothing else on the canvas, and empty is default state, so there is
	// no fixture file to keep in step with the app. Every shape is left PENDING and
	// never committed, so the project stays empty and the recipe repeats cleanly.
	{
		id: 'drawing-shape-drawer',
		asset: 'design/drawing-tools/shape-drawer.png',
		viewport: { width: 1440, height: 900 },
		steps: (page) => page.getByRole('button', { name: 'Choose feature shape' }).click(),
		// The rail as well as the drawer: the point of the shot is where the drawer opens from.
		clip: (page) =>
			page.evaluate(() => {
				const drawer = document.querySelector('.toolbar-creation-picker__drawer').getBoundingClientRect()
				const rail = [...document.querySelectorAll('button')]
					.map((b) => b.getBoundingClientRect())
					.filter((r) => r.width > 0 && r.x < 60 && r.y > 40 && r.y < 500)
				const top = Math.min(drawer.top, ...rail.map((r) => r.top))
				const bottom = Math.max(drawer.bottom, ...rail.map((r) => r.bottom))
				const m = 10
				return {
					x: 0,
					y: Math.round(top - m),
					width: Math.round(drawer.right + m),
					height: Math.round(bottom - top + m * 2),
				}
			}),
	},
	{
		id: 'drawing-creation-target',
		asset: 'design/drawing-tools/creation-target.png',
		viewport: { width: 1440, height: 900 },
		clip: (page) =>
			page.evaluate(() => {
				const names = ['Create features', 'Create lines', 'Create regions', 'Create construction geometry']
				const rects = names
					.map((n) => [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.getAttribute('title')) === n))
					.filter(Boolean)
					.map((el) => el.getBoundingClientRect())
				const x = Math.min(...rects.map((r) => r.x))
				const y = Math.min(...rects.map((r) => r.y))
				const right = Math.max(...rects.map((r) => r.right))
				const bottom = Math.max(...rects.map((r) => r.bottom))
				// 6px only: a wider margin catches a sliver of the shape drawer below.
				const m = 6
				return {
					x: Math.max(0, Math.round(x - m)),
					y: Math.round(y - m),
					width: Math.round(right - x + m * 2),
					height: Math.round(bottom - y + m * 2),
				}
			}),
	},
	{
		id: 'drawing-typed-dimensions',
		asset: 'design/drawing-tools/typed-dimensions.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickTo(page, 0.26, 0.30)
			// Tab is what swaps the panel for the typed-entry form.
			await page.keyboard.press('Tab')
			await page.waitForTimeout(700)
			// Real values rather than the 0 the form opens with, so the shot also shows the
			// pending rectangle tracking what is typed.
			const fields = page.locator('.canvas-workflow-panel input')
			await fields.nth(0).fill('2.5')
			await page.waitForTimeout(350)
			await fields.nth(1).fill('1.5')
			await page.waitForTimeout(700)
		},
		clip: clipCanvas,
	},
	{
		id: 'drawing-rectangle',
		asset: 'design/drawing-tools/rectangle.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// Rectangle is the rail's default shape, so it needs no drawer visit.
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickTo(page, 0.22, 0.32)
			// Held on hover: the second corner is never clicked, so the rectangle stays pending.
			await moveTo(page, 0.70, 0.72)
		},
		clip: clipCanvas,
	},
	{
		id: 'drawing-circle',
		asset: 'design/drawing-tools/circle.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature circle')
			await clickTo(page, 0.48, 0.55)
			// Level with the centre, so grid snapping yields a round radius rather than 1.0753.
			await moveTo(page, 0.72, 0.55)
		},
		clip: clipCanvas,
	},
	{
		id: 'drawing-ellipse',
		asset: 'design/drawing-tools/ellipse.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature ellipse')
			await clickTo(page, 0.48, 0.56)
			await moveTo(page, 0.74, 0.34)
		},
		clip: clipCanvas,
	},
	{
		id: 'drawing-polygon',
		asset: 'design/drawing-tools/polygon.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature polygon')
			for (const [fx, fy] of [[0.24, 0.72], [0.32, 0.34], [0.64, 0.30], [0.76, 0.62]]) {
				await clickTo(page, fx, fy)
			}
			// Left open on purpose: an unfinished chain is what shows Finish/Undo/Cancel.
			await moveTo(page, 0.48, 0.80)
		},
		clip: clipCanvas,
	},
	{
		id: 'drawing-spline',
		asset: 'design/drawing-tools/spline.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature spline')
			// A single hump: a zig-zag makes the closed profile self-intersect and the panel
			// then carries a warning that has nothing to do with the spline tool.
			for (const [fx, fy] of [[0.20, 0.66], [0.34, 0.40], [0.54, 0.34], [0.70, 0.44]]) {
				await clickTo(page, fx, fy)
			}
			await moveTo(page, 0.80, 0.66)
		},
		clip: clipCanvas,
	},
	{
		id: 'drawing-composite',
		asset: 'design/drawing-tools/composite.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature composite')
			await clickTo(page, 0.22, 0.66)
			await clickTo(page, 0.36, 0.66)
			await page.getByRole('button', { name: /^Arc \(A\)$/ }).click()
			await page.waitForTimeout(450)
			await clickTo(page, 0.52, 0.36)
			await page.getByRole('button', { name: /^Spline \(S\)$/ }).click()
			await page.waitForTimeout(450)
			await clickTo(page, 0.68, 0.56)
			await moveTo(page, 0.80, 0.36)
		},
		clip: clipCanvas,
	},

	{
		id: 'arranging-scale-taper',
		asset: 'design/arranging/scale-taper.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// Twelve per-copy labels would cover the ring, and the taper is the subject here.
			await page.locator('[title="Hide feature labels"]').first().click()
			await page.waitForTimeout(600)
			await pickShape(page, 'Add feature circle')
			// A small circle: twelve of them have to fit round the ring without overlapping.
			await clickTo(page, 0.46, 0.26)
			await clickTo(page, 0.495, 0.26)
			await page.waitForTimeout(1100)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(700)
			await clickTo(page, 0.46, 0.26)
			await page.waitForTimeout(900)
			await distribute(page, 'Radial')
			await page.getByRole('button', { name: /Pick center/i }).first().click()
			await page.waitForTimeout(700)
			await clickTo(page, 0.46, 0.46)
			await page.waitForTimeout(1300)
			const field = (i) => page.locator('.canvas-workflow-panel input[type=number]').nth(i)
			await field(0).fill('12')
			await page.waitForTimeout(700)
			await field(2).fill('100')
			await page.waitForTimeout(500)
			await field(3).fill('10')
			await page.waitForTimeout(2200)
			// Committed rather than previewed, deliberately: every previewed copy carries a
			// "Feature distribution preview" label that the Feature labels toggle does not
			// control, and twelve of them overlap into mush. The taper itself is the subject,
			// so the real copies read better. The preview is correct since #813 was fixed.
			await page.getByRole('button', { name: 'Create copies' }).first().click()
			await page.waitForTimeout(2500)
		},
		clip: clipCanvas,
	},

	// --- Design: text ----------------------------------------------------------
	{
		id: 'text-add-dialog',
		asset: 'design/text/add-text-dialog.png',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await pickShape(page, 'Add feature text')
			await page.waitForTimeout(1300)
			const dialog = page.locator('.dialog--import')
			await dialog.locator('textarea').first().fill('PURECUT')
			// These are custom dropdowns, not <select>: click to open, then pick the option.
			// (The Text layout panel, confusingly, does use real <select> elements.)
			await dialog.getByRole('button', { name: 'Skeleton' }).click()
			await page.waitForTimeout(700)
			await page.getByText('Outline', { exact: true }).first().click()
			await page.waitForTimeout(1000)
		},
		clip: clipDialog('.dialog--import', 20),
	},
	{
		id: 'text-layout',
		asset: 'design/text/text-layout.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// Small source text: with Fit set to fill the span the run is sized by the guide,
			// so a short original stays tucked behind the panel instead of overrunning the shot.
			await placeText(page, { words: 'PURECUT', height: 0.15, fx: 0.28, fy: 0.3 })
			await pickShape(page, 'Add feature spline')
			for (const [fx, fy] of [[0.22, 0.62], [0.4, 0.5], [0.58, 0.64], [0.76, 0.52]]) {
				await clickTo(page, fx, fy)
				await page.waitForTimeout(800)
			}
			await page.getByRole('button', { name: 'Finish' }).first().click()
			await page.waitForTimeout(1500)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(700)
			await page.getByText('PURECUT', { exact: true }).first().click()
			await page.waitForTimeout(1000)
			await distribute(page, 'Text layout')
			await page.locator('.canvas-workflow-panel select').first().selectOption({ label: 'Along a path' })
			await page.waitForTimeout(1300)
			await page.getByRole('button', { name: /Pick guide/i }).first().click()
			await page.waitForTimeout(800)
			// Away from the ends: a click near the spline's middle misses it.
			await clickTo(page, 0.58, 0.64)
			await page.waitForTimeout(1400)
			const fit = page.locator('.canvas-workflow-panel select').filter({ hasText: 'Keep text size' }).first()
			await fit.selectOption({ label: 'Fill the span' })
			await page.waitForTimeout(1500)
		},
		clip: clipWorkspaceLeft,
	},
	{
		id: 'text-expanded-glyphs',
		asset: 'design/text/expanded-glyphs.png',
		viewport: { width: 1440, height: 900 },
		storage: WIDE_TREE,
		collapseLegend: true,
		async steps(page) {
			// One label per glyph feature piles up on the canvas, and the tree carries the
			// structure that this visual is about.
			await page.locator('[title="Hide feature labels"]').first().click()
			await page.waitForTimeout(600)
			await placeText(page, { words: 'PURE', height: 0.6, fx: 0.34, fy: 0.4 })
			await page.getByText('PURE', { exact: true }).first().click()
			await page.waitForTimeout(1000)
			// Expand text to features sits inside SHAPE, which opens collapsed.
			for (const header of await page.locator('.disclosure-section__header').all()) {
				if ((await header.getAttribute('aria-expanded')) === 'false') {
					await header.click()
					await page.waitForTimeout(400)
				}
			}
			await page.getByRole('button', { name: 'Expand text to features' }).first().click()
			await page.waitForTimeout(3000)
		},
		clip: clipWorkspaceLeft,
	},

	// --- Design: dimensions and constraints ------------------------------------
	{
		id: 'dimensions-on-part',
		asset: 'design/dimensions-and-constraints/dimensions-on-part.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.24, 0.34)
			await clickUntil(page, 0.52, 0.56)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			// A circle as well, so a radius dimension has something to measure.
			await pickShape(page, 'Add feature circle')
			await clickUntil(page, 0.7, 0.45)
			await clickUntil(page, 0.78, 0.45)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(700)
			await addDimension(page, 'Horizontal dimension')
			await clickTo(page, 0.24, 0.34)
			await clickTo(page, 0.52, 0.34)
			await clickTo(page, 0.38, 0.27)
			await page.waitForTimeout(900)
			await addDimension(page, 'Vertical dimension')
			await clickTo(page, 0.24, 0.34)
			await clickTo(page, 0.24, 0.56)
			await clickTo(page, 0.17, 0.45)
			await page.waitForTimeout(900)
			await addDimension(page, 'Radius dimension')
			// Centre first, then a point on the edge.
			await clickTo(page, 0.7, 0.45)
			await page.waitForTimeout(800)
			await clickTo(page, 0.8, 0.34)
			await page.waitForTimeout(1000)
			// Select one of them, so the shot also shows a dimension being edited.
			await clickTo(page, 0.38, 0.27)
			await page.waitForTimeout(1000)
		},
		clip: clipCanvas,
	},
	{
		id: 'constraints-panel',
		asset: 'design/dimensions-and-constraints/constraint-panel.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.22, 0.32)
			await clickUntil(page, 0.36, 0.46)
			await page.waitForTimeout(900)
			await clickUntil(page, 0.56, 0.5)
			await clickUntil(page, 0.7, 0.64)
			await page.waitForTimeout(1200)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.29, 0.39)
			await page.waitForTimeout(800)
			await page.getByRole('button', { name: 'Add constraint' }).first().click()
			await page.waitForTimeout(900)
			await clickTo(page, 0.36, 0.46)
			await page.waitForTimeout(1000)
			await clickTo(page, 0.56, 0.5)
			await page.waitForTimeout(1200)
		},
		clip: clipCanvas,
	},

	// --- Design: arranging -----------------------------------------------------
	{
		id: 'arranging-distribute-grid',
		asset: 'design/arranging/distribute-grid.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// Each previewed copy carries a "Feature distribution preview" label, and six of
			// them overlap into mush.
			await page.locator('[title="Hide feature labels"]').first().click()
			await page.waitForTimeout(600)
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.2, 0.46)
			await clickUntil(page, 0.27, 0.53)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.235, 0.495)
			await page.waitForTimeout(800)
			await distribute(page, 'Grid')
			const field = (i) => page.locator('.canvas-workflow-panel input[type=number]').nth(i)
			await field(0).click()
			await page.keyboard.press('ArrowUp')
			await page.waitForTimeout(600)
			await field(1).click()
			await page.keyboard.press('ArrowUp')
			await page.waitForTimeout(600)
			await field(2).fill('0.6')
			await page.keyboard.press('Tab')
			await field(3).fill('0.6')
			await page.keyboard.press('Tab')
			await page.waitForTimeout(1800)
		},
		clip: clipCanvas,
	},
	{
		id: 'arranging-distribute-radial',
		asset: 'design/arranging/distribute-radial.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.44, 0.22)
			await clickUntil(page, 0.52, 0.3)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.48, 0.26)
			await page.waitForTimeout(800)
			await distribute(page, 'Radial')
			await page.getByRole('button', { name: /Pick center/i }).first().click()
			await page.waitForTimeout(700)
			await clickTo(page, 0.48, 0.52)
			await page.waitForTimeout(1200)
			await page.locator('.canvas-workflow-panel input[type=number]').first().fill('8')
			await page.waitForTimeout(1600)
		},
		clip: clipCanvas,
	},
	{
		id: 'arranging-distribute-path',
		asset: 'design/arranging/distribute-path.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.2, 0.24)
			await clickUntil(page, 0.27, 0.31)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			// A separate outline for the copies to follow.
			await pickShape(page, 'Add feature spline')
			for (const [fx, fy] of [[0.24, 0.62], [0.4, 0.48], [0.58, 0.64], [0.76, 0.5]]) {
				await clickTo(page, fx, fy)
				await page.waitForTimeout(800)
			}
			await page.getByRole('button', { name: 'Finish' }).first().click()
			await page.waitForTimeout(1400)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.235, 0.275)
			await page.waitForTimeout(900)
			await distribute(page, 'Along path')
			await page.getByRole('button', { name: /Pick guide/i }).first().click()
			await page.waitForTimeout(700)
			// Away from the end points: a click near the spline's middle misses it.
			await clickTo(page, 0.58, 0.64)
			await page.waitForTimeout(1400)
			await page.locator('.canvas-workflow-panel input[type=number]').first().fill('6')
			await page.waitForTimeout(1600)
		},
		clip: clipCanvas,
	},

	// --- Design: sketch editing ------------------------------------------------
	// Shared opener: one rectangle, selected, with its sketch edit session running.
	{
		id: 'sketch-edit-session',
		asset: 'design/sketch-editing/edit-session.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await editRectangle(page)
			// Clicking a segment is what puts its Length and Angle in the panel.
			await clickTo(page, 0.46, 0.36)
			await page.waitForTimeout(1200)
		},
		clip: clipCanvas,
	},
	{
		id: 'sketch-edit-fillet',
		asset: 'design/sketch-editing/fillet.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await editRectangle(page)
			await page.getByRole('button', { name: 'Round corner / fillet' }).first().click()
			await page.waitForTimeout(700)
			await clickTo(page, 0.3, 0.36)
			await page.waitForTimeout(1000)
			// Held on hover: the radius follows the pointer until the second click.
			await moveTo(page, 0.36, 0.42)
			await page.waitForTimeout(1000)
		},
		clip: clipCanvas,
	},
	{
		id: 'sketch-edit-trim',
		asset: 'design/sketch-editing/trim.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// Trim is unavailable on a closed profile, so this needs an open path, and one
			// that crosses itself so there is a cutting edge within the same sketch.
			await pickShape(page, 'Add feature polygon')
			for (const [fx, fy] of [[0.28, 0.36], [0.62, 0.6], [0.62, 0.36], [0.28, 0.6]]) {
				await clickTo(page, fx, fy)
				await page.waitForTimeout(800)
			}
			await page.getByRole('button', { name: 'Finish' }).first().click()
			await page.waitForTimeout(1400)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.45, 0.48)
			await page.waitForTimeout(900)
			await page.getByRole('button', { name: 'Edit sketch' }).first().click()
			await page.waitForTimeout(1300)
			await page.getByRole('button', { name: 'Trim to cutting edge' }).first().click()
			await page.waitForTimeout(800)
			await clickTo(page, 0.58, 0.39)
			await page.waitForTimeout(1100)
		},
		clip: clipCanvas,
	},

	// --- Design: shape operations ----------------------------------------------
	{
		id: 'shape-offset-preview',
		asset: 'design/shape-operations/offset-preview.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.32, 0.38)
			await clickUntil(page, 0.6, 0.6)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.46, 0.49)
			await page.waitForTimeout(700)
			await page.getByRole('button', { name: 'Create offset feature' }).first().click()
			await page.waitForTimeout(800)
			// Outside the shape, so the preview reads as an outward offset.
			await moveTo(page, 0.66, 0.49)
			await page.waitForTimeout(900)
		},
		clip: clipCanvas,
	},
	{
		id: 'shape-cut-workflow',
		asset: 'design/shape-operations/cut-workflow.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.28, 0.34)
			await clickUntil(page, 0.66, 0.64)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			// An open path across the rectangle: the cutter that splits a closed target.
			await pickShape(page, 'Add feature polygon')
			// Plain clicks here: after the second point the panel stops changing, so there is
			// nothing for clickUntil to watch.
			for (const [fx, fy] of [[0.22, 0.46], [0.46, 0.56], [0.72, 0.44]]) {
				await clickTo(page, fx, fy)
				await page.waitForTimeout(800)
			}
			await page.getByRole('button', { name: 'Finish' }).first().click()
			await page.waitForTimeout(1400)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.46, 0.56)
			await page.waitForTimeout(900)
			await page.getByRole('button', { name: 'Cut features' }).first().click()
			await page.waitForTimeout(1000)
			await clickTo(page, 0.45, 0.39)
			await page.waitForTimeout(1400)
		},
		clip: clipCanvas,
	},

	// --- Design: selecting and transforming ------------------------------------
	{
		id: 'selection-overlap-picker',
		asset: 'design/selecting-and-transforming/overlap-picker.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// Two rectangles on the same corners. The picker appears where outlines lie on top
			// of one another; a shape merely enclosed by another selects directly instead.
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.3, 0.34)
			await clickUntil(page, 0.62, 0.62)
			await page.waitForTimeout(900)
			// The tool re-arms itself, so the second rectangle needs no trip to the rail.
			await clickUntil(page, 0.3, 0.34)
			await clickUntil(page, 0.62, 0.62)
			await page.waitForTimeout(1200)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.46, 0.34)
			await page.waitForTimeout(1000)
		},
		// The tree as well: the picker's entries are meant to be read against its rows.
		clip: clipWorkspaceLeft,
	},
	{
		id: 'selection-transform-panel',
		asset: 'design/selecting-and-transforming/transform-panel.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.3, 0.4)
			await clickUntil(page, 0.44, 0.54)
			await page.waitForTimeout(1000)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			await clickTo(page, 0.37, 0.47)
			await page.waitForTimeout(700)
			await page.getByRole('button', { name: 'Rotate selected features' }).first().click()
			await page.waitForTimeout(700)
			await clickUntil(page, 0.5, 0.6)
			await clickUntil(page, 0.62, 0.6)
			// Tick the box rather than pressing K: the shortcut does not always land.
			await page.locator('.canvas-workflow-panel input[type=checkbox]').first().check()
			await page.waitForTimeout(500)
			await clickUntil(page, 0.62, 0.42)
			await page.waitForTimeout(1000)
			// Filled but not confirmed: Enter commits the rotation and the panel closes.
			await page.locator('.canvas-workflow-panel input:not([type=checkbox])').first().fill('5')
			await page.waitForTimeout(1200)
		},
		clip: clipWorkspaceLeft,
	},

	// --- Design: snapping ------------------------------------------------------
	{
		id: 'snapping-popover',
		asset: 'design/snapping-and-grid/snap-popover.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			// One committed rectangle to snap to. The bundled examples carry toolpaths, which
			// bury the snap label under contour lines.
			await page.getByRole('button', { name: 'Add feature rectangle' }).first().click()
			await page.waitForTimeout(450)
			await clickUntil(page, 0.24, 0.28)
			await clickUntil(page, 0.74, 0.60)
			await page.waitForTimeout(1200)
			await page.getByRole('button', { name: 'Collapse feature color legend' }).first().click().catch(() => {})
			await page.waitForTimeout(500)
			// The tool re-arms, so hovering the top edge's midpoint raises the snap label.
			for (const fx of [0.49, 0.5, 0.485, 0.495]) {
				await moveTo(page, fx, 0.28)
				await page.waitForTimeout(600)
			}
		},
		// Toolbar through the canvas: the buttons and the label are the subject together.
		clip: (page) =>
			page.evaluate(() => {
				const c = document.querySelector('.sketch-viewport__canvas') ?? document.querySelector('canvas')
				const r = c.getBoundingClientRect()
				return { x: Math.round(r.x), y: 0, width: Math.round(r.width), height: Math.round(r.y + r.height * 0.72) }
			}),
	},

	// --- Design: parametric shapes ---------------------------------------------
	{
		id: 'parametric-slot',
		asset: 'design/parametric-shapes/slot.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature slot')
			await clickTo(page, 0.28, 0.52)
			await clickTo(page, 0.68, 0.52)
			// Both ends are set; the third step is width, which is the step the page documents.
			await moveTo(page, 0.68, 0.36)
		},
		clip: clipCanvas,
	},
	{
		id: 'parametric-regular-polygon',
		asset: 'design/parametric-shapes/regular-polygon.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature regular polygon')
			// Sides defaults to 6; the page talks about eight.
			const sides = page.locator('.canvas-workflow-panel input').first()
			await sides.fill('8')
			await sides.press('Enter')
			await page.waitForTimeout(400)
			await clickTo(page, 0.46, 0.56)
			await moveTo(page, 0.70, 0.56)
		},
		clip: clipCanvas,
	},
	{
		id: 'parametric-gear',
		asset: 'design/parametric-shapes/gear.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature gear')
			// Placed right of centre so the tall parameters panel does not sit over the gear.
			await clickTo(page, 0.58, 0.62)
			// Setting the radius is what opens the full parameter list.
			await clickTo(page, 0.78, 0.62)
			await page.waitForTimeout(1200)
		},
		clip: clipCanvas,
	},
	{
		id: 'parametric-rounded-rectangle',
		asset: 'design/parametric-shapes/rounded-rectangle.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature rounded rectangle')
			await clickTo(page, 0.24, 0.32)
			await moveTo(page, 0.72, 0.74)
		},
		clip: clipCanvas,
	},
	{
		id: 'parametric-chamfered-rectangle',
		asset: 'design/parametric-shapes/chamfered-rectangle.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature chamfered rectangle')
			await clickTo(page, 0.24, 0.32)
			await moveTo(page, 0.72, 0.74)
		},
		clip: clipCanvas,
	},
]

function parseArgs(argv) {
	const args = { only: null, list: false }
	for (const arg of argv) {
		if (arg === '--list') args.list = true
		else if (arg.startsWith('--only=')) args.only = arg.slice(7).split(',').map((s) => s.trim())
		else if (arg === '--only') args.onlyNext = true
		else if (args.onlyNext) {
			args.only = arg.split(',').map((s) => s.trim())
			args.onlyNext = false
		} else throw new Error(`unknown argument: ${arg}`)
	}
	return args
}

function loadInventory() {
	const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
	return new Map(inventory.visuals.map((visual) => [visual.id, visual]))
}

/** A recipe that has drifted from the inventory would silently write the wrong file. */
function checkAgainstInventory(recipes, visuals) {
	const problems = []
	for (const recipe of recipes) {
		const visual = visuals.get(recipe.id)
		if (!visual) problems.push(`${recipe.id}: no such visual in the inventory`)
		else if (visual.kind !== 'screenshot') problems.push(`${recipe.id}: inventory kind is ${visual.kind}, not screenshot`)
		else if (visual.asset !== recipe.asset) problems.push(`${recipe.id}: inventory asset is ${visual.asset}, recipe writes ${recipe.asset}`)
	}
	if (problems.length) {
		console.error('Recipes disagree with the inventory:')
		for (const problem of problems) console.error(`  ${problem}`)
		process.exit(1)
	}
}

async function capture(browser, recipe) {
	const context = await browser.newContext({
		viewport: recipe.viewport,
		deviceScaleFactor: 2,
		colorScheme: 'dark',
		...recipe.context,
	})
	try {
		if (recipe.storage) {
			await context.addInitScript((entries) => {
				for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
			}, recipe.storage)
		}
		const page = await context.newPage()
		await page.goto(APP_URL, { waitUntil: 'networkidle' })

		if (recipe.fixture) {
			await page.getByRole('button', { name: FIXTURES[recipe.fixture] }).click()
			// The example has to finish building its model before anything is worth capturing.
			await page.waitForTimeout(2500)
		} else {
			// Empty project: dismiss "Start your part" and draw on the bare 4x3 stock. Design
			// tool shots want nothing else on the canvas, and an empty project is default state,
			// so there is no fixture file to keep in step with the app.
			await page.getByRole('button', { name: /^close$/i }).first().click()
			await page.waitForTimeout(600)
		}

		if (recipe.collapseLegend) {
			// The feature-colour legend sits on the lower-right canvas, over the drawn shape.
			await page.getByRole('button', { name: 'Collapse feature color legend' }).first().click()
			await page.waitForTimeout(400)
		}

		if (recipe.steps) await recipe.steps(page)
		await page.waitForTimeout(800)

		const target = join(assetRoot, recipe.asset)
		mkdirSync(dirname(target), { recursive: true })
		const clip = recipe.clip ? await recipe.clip(page) : undefined
		await page.screenshot({ path: target, clip })

		const { width, height } = recipe.viewport
		const fixture = recipe.fixture ? `Example: ${recipe.fixture}` : 'Empty project'
		return { ok: true, viewport: `${width}x${height}@2x`, fixture }
	} finally {
		await context.close()
	}
}

const args = parseArgs(process.argv.slice(2))
const visuals = loadInventory()

if (args.list) {
	for (const recipe of RECIPES) {
		console.log(`${recipe.id.padEnd(28)} ${recipe.viewport.width}x${recipe.viewport.height}  ${recipe.asset}`)
	}
	process.exit(0)
}

checkAgainstInventory(RECIPES, visuals)

const selected = args.only ? RECIPES.filter((r) => args.only.includes(r.id)) : RECIPES
if (args.only) {
	const missing = args.only.filter((id) => !RECIPES.some((r) => r.id === id))
	if (missing.length) {
		console.error(`No recipe for: ${missing.join(', ')}`)
		process.exit(1)
	}
}

const response = await fetch(APP_URL).catch(() => null)
if (!response?.ok) {
	console.error(`Cannot reach the app at ${APP_URL}.`)
	console.error('Start the dev server first, or set PURECUT_APP_URL.')
	process.exit(1)
}

const browser = await chromium.launch()
const results = []
try {
	for (const recipe of selected) {
		process.stdout.write(`${recipe.id} … `)
		try {
			const result = await capture(browser, recipe)
			results.push({ recipe, ...result })
			console.log('ok')
		} catch (error) {
			results.push({ recipe, ok: false, error })
			console.log(`FAILED — ${error.message.split('\n')[0]}`)
		}
	}
} finally {
	await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\nCaptured ${results.length - failed.length} of ${results.length}.`)
console.log('\nmedia.json fields for the captures above:')
for (const result of results.filter((r) => r.ok)) {
	console.log(`  ${result.recipe.asset}`)
	console.log(`    "fixture": ${JSON.stringify(result.fixture)}, "viewport": "${result.viewport}", "theme": "dark", "locale": "en"`)
}
if (failed.length) process.exit(1)
