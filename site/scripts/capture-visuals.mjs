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
import { execFileSync } from 'node:child_process'
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

/**
 * The app commit a capture records. It is read here rather than typed into media.json,
 * because a hand-copied SHA goes stale silently: the app moves on, the screenshots are
 * re-shot, and the recorded commit still names the old one.
 *
 * The running app cannot be asked — in dev its version.json is just { version: 'dev' } —
 * so this reads the app repository's HEAD. Set PURECUT_APP_REPO if it is not beside the
 * docs checkout.
 */
function appCommit() {
	const git = (dir, args) =>
		execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
	const candidates = []
	if (process.env.PURECUT_APP_REPO) candidates.push(process.env.PURECUT_APP_REPO)
	try {
		// From a worktree, the main checkout is what sits beside the app repository.
		const main = git(repoRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
		candidates.push(join(main, '../../purecutcnc'))
	} catch {}
	candidates.push(join(repoRoot, '../purecutcnc'), join(repoRoot, '../../purecutcnc'))
	for (const dir of candidates) {
		try {
			// Confirm it is the app and not some other repository that happens to be there.
			const remote = git(dir, ['remote', 'get-url', 'origin'])
			if (!/PureCutCNC\/purecutcnc(\.git)?$/i.test(remote.replace(/\/$/, ''))) continue
			return git(dir, ['rev-parse', 'HEAD'])
		} catch {}
	}
	return null
}

const APP_COMMIT = appCommit()

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
// Shorter still: the backdrop's properties run to Angle plus five buttons, and the
// default split cuts them off.
const SHORT_TREE = { 'panel-split:left-center': '0.25', 'panel-split:project-tree': '0.34' }

// The CAM panel is narrow by default, which makes a panel-only crop a tall, thin
// strip that the page then has to shrink. A wider panel, and a list that is only as
// tall as its contents need, gives a shot that reads at its natural size.
const CAM_TOOLS = { 'panel-split:center-right': '0.34', 'panel-split:tools': '0.30' }
const CAM_OPS = { 'panel-split:center-right': '0.34', 'panel-split:operations': '0.52' }

/** The CAM panel from its top down to the last row named, so a short list is not
    padded out with the empty space the panel reserves below it. */
const clipCamList = (lastRow) => (page) =>
	page.evaluate((t) => {
		const panel = document.querySelector('.panel-right').getBoundingClientRect()
		const rows = [...document.querySelectorAll('.panel-right *')].filter(
			(e) => e.children.length === 0 && e.textContent.trim() === t,
		)
		const last = rows[rows.length - 1]
		const bottom = last ? last.getBoundingClientRect().bottom + 22 : panel.bottom
		return {
			x: Math.round(panel.x),
			y: Math.round(panel.y),
			width: Math.round(Math.min(panel.width, window.innerWidth - panel.x)),
			height: Math.round(Math.min(bottom, window.innerHeight) - panel.y),
		}
	}, lastRow)

/** Canvas and CAM panel together, for shots where an operation's warning explains
    what the canvas is showing. */
const clipCanvasAndCam = (page) =>
	page.evaluate(() => {
		const canvas = (
			document.querySelector('.sketch-viewport__canvas') ?? document.querySelector('canvas')
		).getBoundingClientRect()
		const cam = document.querySelector('.panel-right')?.getBoundingClientRect()
		const right = cam ? Math.min(cam.right, window.innerWidth) : window.innerWidth
		return {
			x: Math.round(canvas.x),
			y: Math.round(canvas.y),
			width: Math.round(right - canvas.x),
			height: Math.round(Math.min(canvas.bottom, window.innerHeight) - canvas.y),
		}
	})

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


/** The CAM panel on the right: the operations or tools list and the properties below it. */
const clipCamPanel = (page) =>
	page.locator('.panel-right').evaluate((el) => {
		const r = el.getBoundingClientRect()
		return {
			x: Math.round(r.x),
			y: Math.round(r.y),
			width: Math.round(Math.min(r.width, window.innerWidth - r.x)),
			height: Math.round(Math.min(r.bottom, window.innerHeight) - r.y),
		}
	})

/** A file the app itself serves, so the fixture is the app's own copy at this commit. */
async function appFile(name, url) {
	const res = await fetch(new URL(url, APP_URL))
	if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
	return { name, mimeType: 'application/octet-stream', buffer: Buffer.from(await res.arrayBuffer()) }
}

/** The Source units dropdown, which has no test id of its own. */
const sourceUnits = (page) =>
	page.locator('.import-dialog__info-row', { hasText: 'Source units' }).locator('select')

/** Zoom the sketch in on a point, given as fractions of the canvas. The default view
    fits the whole stock, which leaves an operation's toolpath a few pixels wide. */
async function zoomTo(page, fx, fy, steps = 5) {
	const box = await canvasRect(page)
	const x = box.x + box.w * fx
	const y = box.y + box.h * fy
	await page.mouse.move(x, y)
	await page.waitForTimeout(300)
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel(0, -240)
		await page.waitForTimeout(220)
	}
	await page.waitForTimeout(900)
}

/** Pick a value in one of the properties panel's custom dropdowns, found by the value it
    currently shows. These are not <select> elements, so selectOption does not reach them. */
async function setUiSelect(page, current, value) {
	await page.evaluate((cur) => {
		const label = [...document.querySelectorAll('.panel-right .ui-select__label')].find(
			(e) => e.textContent.trim() === cur,
		)
		const trigger = label?.closest('.ui-select')?.querySelector('.ui-select__trigger')
		if (!trigger) throw new Error(`no dropdown currently showing "${cur}"`)
		trigger.click()
	}, current)
	await page.waitForTimeout(900)
	// A synthetic click on the option does not commit the choice — the control listens
	// for real pointer input — so this goes through Playwright. Labels carry qualifiers
	// the caller should not have to spell out: "Trochoidal" is shown as "Trochoidal
	// (slot)", so the match is a substring.
	await page
		.locator('.ui-select--open .ui-select__option', { hasText: value })
		.first()
		.click()
	await page.waitForTimeout(2500)
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll('button')].some((b) =>
				/Toolpaths up to date/.test(b.getAttribute('aria-label') ?? ''),
			),
		null,
		{ timeout: 300000 },
	)
	await page.waitForTimeout(2000)
	const now = await page.evaluate(
		(cur) =>
			[...document.querySelectorAll('.panel-right .ui-select__label')].some(
				(e) => e.textContent.trim() === cur,
			),
		current,
	)
	if (now) throw new Error(`the dropdown still shows "${current}"; the choice did not take`)
}

/** Create an operation the way a reader would: select geometry, open Add, pick the
    entry and its pass. Returns the new operation's name, which the app derives from the
    kind and pass, so callers do not have to guess it. The bundled examples cover only
    five of the eleven operation kinds; the rest have to be made. */
async function addOperation(page, feature, entry, pass = 'Add') {
	const names = () =>
		page.evaluate(() =>
			[...document.querySelectorAll('.panel-right button')]
				.map((b) => (b.getAttribute('aria-label') ?? '').match(/^(?:Show|Hide) toolpath for (.+)$/)?.[1])
				.filter(Boolean),
		)
	const before = new Set(await names())
	await page.getByText(feature, { exact: true }).first().click()
	await page.waitForTimeout(1200)
	await page.getByRole('button', { name: /^Add$/ }).first().click()
	await page.waitForSelector('.cam-add-menu')
	await page.waitForTimeout(800)
	await page.evaluate(
		([op, btn]) => {
			// Scope to the row. Walking up from the label reaches the whole menu, where the
			// first button matching the pass belongs to some other operation entirely.
			const item = [...document.querySelectorAll('.cam-add-menu .cam-operation-item')].find((el) =>
				el.textContent.trim().startsWith(op),
			)
			if (!item) throw new Error(`no "${op}" entry in the add menu`)
			const buttons = [...item.querySelectorAll('button')]
			const b = buttons.find((x) => x.textContent.trim() === btn)
			if (!b) {
				const offered = buttons.map((x) => x.textContent.trim()).join(', ')
				throw new Error(`"${op}" has no "${btn}" button; it offers: ${offered}`)
			}
			b.click()
		},
		[entry, pass],
	)
	await page.waitForTimeout(2500)
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll('button')].some((b) =>
				/Toolpaths up to date/.test(b.getAttribute('aria-label') ?? ''),
			),
		null,
		{ timeout: 300000 },
	)
	await page.waitForTimeout(2000)
	const added = (await names()).filter((n) => !before.has(n))
	if (!added.length) throw new Error(`adding ${entry} created no operation`)
	return added[0]
}

/** The centre view on its own: the 3D or simulation viewport without the panels. */
const clipCentreView = (page) =>
	page.locator('.centre-view--active').evaluate((el) => {
		const r = el.getBoundingClientRect()
		return {
			x: Math.round(r.x),
			y: Math.round(r.y),
			width: Math.round(r.width),
			height: Math.round(r.height),
		}
	})

/** What one operation leaves in the stock. The Simulation view already sits at the last
    toolpath level, so nothing has to be played; the scope is set to Selected so the cut
    shown belongs to this operation alone, and Detail is raised because the default
    resolution renders pocket walls as coarse steps. */
async function simulateResult(page, opName, { detail = 1200, zoom = 0, at = [0.5, 0.5] } = {}) {
	await page.getByText(opName, { exact: true }).first().click()
	await page.waitForTimeout(1500)
	await page.getByRole('tab', { name: /Simulation/i }).click()
	await page.waitForTimeout(5000)
	await page.evaluate(() => {
		const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Selected')
		if (el && el.getAttribute('aria-pressed') !== 'true') el.click()
	})
	await page.waitForTimeout(1500)
	await page.evaluate((value) => {
		const slider = [...document.querySelectorAll('input[type=range]')].find(
			(i) => Number(i.max) >= 1000 && Number(i.min) >= 100,
		)
		if (!slider) throw new Error('no detail slider')
		const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
		setter.call(slider, String(value))
		slider.dispatchEvent(new Event('input', { bubbles: true }))
		slider.dispatchEvent(new Event('change', { bubbles: true }))
	}, detail)
	// Re-meshing at a higher resolution takes a moment.
	await page.waitForTimeout(9000)
	if (zoom) {
		// The simulation opens framed on the whole stock, which leaves small features —
		// drilled holes, carved lettering — a few pixels across.
		const view = await page.locator('.centre-view--active').boundingBox()
		await page.mouse.move(view.x + view.width * at[0], view.y + view.height * at[1])
		await page.waitForTimeout(300)
		for (let i = 0; i < zoom; i++) {
			await page.mouse.wheel(0, -240)
			await page.waitForTimeout(260)
		}
		await page.waitForTimeout(1500)
	}
}

/** Show only the named move types in the viewport legend. The legend reports its state
    through aria-pressed; there is no "off" class, so testing the class name silently
    leaves every toggle alone. */
async function showMoveTypes(page, keep) {
	await page.evaluate((wanted) => {
		for (const b of document.querySelectorAll('.viewport-toolpath-vis__item')) {
			const name = b.textContent.trim()
			if (name === 'GPU' || name === 'Feed colours') continue
			const on = b.getAttribute('aria-pressed') === 'true'
			if (wanted.includes(name) !== on) b.click()
		}
	}, keep)
	await page.waitForTimeout(2000)
}

/** Draw only the named operation's toolpath, so its shape is legible. */
async function onlyToolpath(page, opName) {
	const click = (name) =>
		page.evaluate((n) => {
			const el = [...document.querySelectorAll('button')].find(
				(b) => (b.getAttribute('aria-label') ?? '') === n,
			)
			if (!el) throw new Error(`no button labelled ${n}`)
			el.click()
		}, name)
	await click('Hide all toolpaths')
	await page.waitForTimeout(1200)
	await click(`Show toolpath for ${opName}`)
	await page.waitForTimeout(2500)
}

/** Set a number field the way a user would, so the app sees the change, and check it
    took. Fields are matched by class: the labels in this panel are not tied to their
    inputs, so matching on label text silently writes to the wrong box. */
async function setNumberField(page, selector, value) {
	await page.evaluate(
		([sel, v]) => {
			const input = document.querySelector(sel)
			if (!input) throw new Error(`no field at ${sel}`)
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
			setter.call(input, v)
			input.dispatchEvent(new Event('input', { bubbles: true }))
			input.dispatchEvent(new Event('change', { bubbles: true }))
			input.blur()
		},
		[selector, value],
	)
	await page.waitForTimeout(800)
	const got = await page.evaluate((sel) => document.querySelector(sel)?.value, selector)
	if (got !== value) throw new Error(`${selector} is ${got}, expected ${value}`)
}

/** Open Import geometry and choose a file. The dialog builds its file input when it opens. */
async function importFile(page, source) {
	await page.getByRole('button', { name: 'Import geometry' }).click()
	await page.waitForSelector('.dialog-backdrop')
	const files = typeof source === 'string' ? join(siteRoot, 'fixtures', source) : source
	await page.locator('input[type=file]').first().setInputFiles(files)
	// Settings and the summary only appear once the dialog has parsed the file, and a
	// STEP file has to load the OCCT importer first, so wait on the content, not a delay.
	await page.waitForFunction(
		() => /Format|Folders/.test(document.querySelector('.dialog-backdrop')?.innerText ?? ''),
		null,
		{ timeout: 60000 },
	)
	await page.waitForTimeout(900)
}

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
async function placeText(page, { words, height, fx, fy, outline = false }) {
	await pickShape(page, 'Add feature text')
	await page.waitForTimeout(1300)
	const dialog = page.locator('.dialog--import')
	await dialog.locator('textarea').first().fill(words)
	if (outline) {
		// Custom dropdown, not a <select>: click to open, then pick.
		await dialog.getByRole('button', { name: 'Skeleton' }).click()
		await page.waitForTimeout(700)
		await page.getByText('Outline', { exact: true }).first().click()
		await page.waitForTimeout(900)
	}
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

	// --- Design: backdrop images -----------------------------------------------
	{
		id: 'backdrop-alignment',
		asset: 'design/backdrop-images/backdrop-alignment.png',
		viewport: { width: 1440, height: 900 },
		storage: SHORT_TREE,
		collapseLegend: true,
		async steps(page) {
			await page.locator('[title="Hide feature labels"]').first().click()
			await page.waitForTimeout(500)
			await page.getByText('Backdrop', { exact: true }).first().click()
			await page.waitForTimeout(900)
			// The picker is a hidden file input, so the image goes straight in.
			await page.locator('input[type=file]').first().setInputFiles(join(siteRoot, 'fixtures/backdrop-bracket.png'))
			await page.waitForTimeout(2500)
			// Dim it, or traced geometry does not read over the image.
			await page.locator('.panel-left input[type=range]').first().fill('35')
			await page.waitForTimeout(800)
			// Trace the upper bolt hole. Its centre lands on 1.125, 1.875 in, which is a grid
			// point, so snapping puts the circle concentric instead of dragging it off.
			await pickShape(page, 'Add feature circle')
			await clickUntil(page, 0.293, 0.407)
			await clickUntil(page, 0.326, 0.407)
			await page.waitForTimeout(1200)
			await page.keyboard.press('Escape')
			await page.waitForTimeout(600)
			// Loading renames the tree row to the file, so "Backdrop" would now match the
			// status bar's visibility toggle and hide the image.
			await page.getByText('backdrop-bracket', { exact: true }).first().click()
			await page.waitForTimeout(1200)
		},
		clip: clipWorkspaceLeft,
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
			// Outline text, and letters that all have counters: the page's point is that a
			// glyph such as O yields an outer and an inner outline, which skeleton text
			// cannot show at all.
			await placeText(page, { words: 'PRO', height: 0.8, fx: 0.34, fy: 0.4, outline: true })
			await page.getByText('PRO', { exact: true }).first().click()
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

	{
		id: 'snapping-axis-lock',
		asset: 'design/snapping-and-grid/axis-lock.png',
		viewport: { width: 1440, height: 900 },
		collapseLegend: true,
		async steps(page) {
			await pickShape(page, 'Add feature polygon')
			await clickUntil(page, 0.28, 0.45)
			// Alt cycles the lock: once for Lock X, twice for Lock Y.
			await page.keyboard.press('Alt')
			await page.waitForTimeout(600)
			// Well off the axis on purpose, so the shot shows the lock overriding the pointer
			// rather than the pointer happening to be on the line.
			await moveTo(page, 0.64, 0.24)
			await page.waitForTimeout(900)
		},
		// Whole canvas: the Lock X chip sits in its bottom-left corner.
		clip: clipCanvas,
	},

	// --- Machining operations ---
	{
		id: 'common-parameters-groups',
		asset: 'operations/common-parameters/property-groups.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await page.getByText('Pocket Rough', { exact: true }).first().click()
			await page.waitForTimeout(2000)
			await page.evaluate(() => {
				const el = [...document.querySelectorAll('button')].find((b) =>
					/Expand operation properties/.test(b.getAttribute('aria-label') ?? ''),
				)
				el?.click()
			})
			await page.waitForSelector('.dialog--panel-expand')
			await page.waitForTimeout(1500)
		},
		clip: clipDialog('.dialog--panel-expand', 0),
	},
	{
		id: 'pocket-offset-toolpath',
		asset: 'operations/pocket/offset-toolpath.png',
		// The PureCutCNC example's pocket is a thin border around lettering, which cannot
		// show nested rings. The guitar's pickup and neck cavities are real pockets.
		fixture: 'T Style guitar body',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await onlyToolpath(page, 'Pocket Rough')
			// At the default zoom the rings are hairlines.
			await zoomTo(page, 0.55, 0.5, 3)
		},
		clip: clipCanvas,
	},
	{
		id: 'pocket-target-highlight',
		asset: 'operations/pocket/target-highlight.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		async steps(page) {
			await onlyToolpath(page, 'Pocket Rough')
			// Selecting the operation is what highlights its targets on the canvas and tree.
			await page.getByText('Pocket Rough', { exact: true }).first().click()
			await page.waitForTimeout(2500)
			await zoomTo(page, 0.5, 0.5, 2)
		},
		clip: clipWorkspaceLeft,
	},
	{
		id: 'edge-outside-route',
		asset: 'operations/edge-route-outside/outside-route.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await onlyToolpath(page, 'Edge route outside Rough')
			// The route runs around the stock edge, so zooming into the middle loses it.
			await zoomTo(page, 0.5, 0.5, 1)
		},
		clip: clipCanvas,
	},
	{
		id: 'drill-hole-order',
		asset: 'operations/drill/hole-order.png',
		// Ten bridge holes show the order far better than the Badge example's four.
		fixture: 'T Style guitar body',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			// Rapids between holes are what show the order they are drilled in.
			await showMoveTypes(page, ['Cuts', 'Lead-ins', 'Rapids', 'Plunges'])
			await onlyToolpath(page, 'Drill bridge holes')
			// A drilling toolpath is vertical moves, which a top view draws as points, so the
			// rapids carry the order. The cluster sits left of centre, not at the body centre.
			await zoomTo(page, 0.345, 0.5, 4)
		},
		clip: clipCanvas,
	},

	{
		id: 'pocket-result',
		asset: 'operations/pocket/result.png',
		fixture: 'T Style guitar body',
		viewport: { width: 1440, height: 900 },
		steps: (page) => simulateResult(page, 'Pocket Rough'),
		clip: clipCentreView,
	},
	{
		id: 'edge-outside-result',
		asset: 'operations/edge-route-outside/result.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		steps: (page) => simulateResult(page, 'Edge route outside Finish'),
		clip: clipCentreView,
	},
	{
		id: 'drill-result',
		asset: 'operations/drill/result.png',
		fixture: 'T Style guitar body',
		viewport: { width: 1440, height: 900 },
		steps: (page) => simulateResult(page, 'Drill bridge holes', { zoom: 9, at: [0.38, 0.42] }),
		clip: clipCentreView,
	},
	{
		id: 'vcarve-medial-result',
		asset: 'operations/v-carve-medial/toolpath.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		steps: (page) => simulateResult(page, 'V-Carve medial', { zoom: 3, at: [0.5, 0.45] }),
		clip: clipCentreView,
	},
	{
		id: 'vcarve-offset-result',
		asset: 'operations/v-carve-offset/toolpath.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		steps: (page) => simulateResult(page, 'V-Carve offset', { zoom: 3, at: [0.5, 0.5] }),
		clip: clipCentreView,
	},	// These six run on the committed CAM fixture: the bundled examples carry no model
	// and no open-line geometry, so engrave, edge route inside, surface clean and the
	// three 3D-surface operations have nothing to be shot against.
	{
		id: 'surface-clean-bands',
		asset: 'operations/surface-clean/toolpath-bands.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			const op = 'Surface clean Rough'
			await onlyToolpath(page, op)
			await zoomTo(page, 0.5, 0.5, 1)
		},
		clip: clipCanvas,
	},
	{
		id: 'edge-inside-route',
		asset: 'operations/edge-route-inside/inside-route.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			const op = 'Edge route inside Rough'
			await onlyToolpath(page, op)
			await zoomTo(page, 0.7, 0.51, 3)
		},
		clip: clipCanvas,
	},
	{
		id: 'engrave-direct',
		asset: 'operations/engrave/direct.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			const op = await addOperation(page, 'Scroll upper 2', 'Engrave')
			await onlyToolpath(page, op)
			await zoomTo(page, 0.34, 0.27, 4)
		},
		clip: clipCanvas,
	},
	{
		id: 'engrave-trochoidal',
		asset: 'operations/engrave/trochoidal.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			const op = await addOperation(page, 'Scroll upper 2', 'Engrave')
			await page.evaluate(() =>
				[...document.querySelectorAll('*')]
					.find((e) => e.children.length === 0 && /^strategy$/i.test(e.textContent.trim()))
					?.click(),
			)
			await page.waitForTimeout(1200)
			await setUiSelect(page, 'Direct', 'Trochoidal')
			await onlyToolpath(page, op)
			// Same framing as the Direct shot, so the two read as a pair.
			await zoomTo(page, 0.34, 0.27, 4)
		},
		clip: clipCanvas,
	},
	{
		id: 'surface-rough-levels',
		asset: 'operations/3d-surface-rough/rough-levels.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			const op = '3D surface rough'
			await onlyToolpath(page, op)
			await zoomTo(page, 0.34, 0.51, 2)
		},
		clip: clipCanvas,
	},
	{
		id: 'surface-finish-patterns',
		asset: 'operations/3d-surface-finish/finish-patterns.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			const op = '3D surface finish'
			await onlyToolpath(page, op)
			await zoomTo(page, 0.34, 0.51, 2)
		},
		clip: clipCanvas,
	},
	{
		id: 'surface-cleanup-passes',
		asset: 'operations/3d-surface-cleanup/cleanup-passes.png',
		fixture: 'site/fixtures/cam-demo.camj',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			// Cleanup targets what a rough and a finish leave behind, so both come first.
			await addOperation(page, 'cam-demo', '3D surface rough')
			await addOperation(page, 'cam-demo', '3D surface finish')
			const op = await addOperation(page, 'cam-demo', '3D surface cleanup')
			await onlyToolpath(page, op)
			await zoomTo(page, 0.34, 0.51, 2)
		},
		clip: clipCanvas,
	},

	// --- CAM setup ---
	// Every shot here runs on a bundled example: the CAM panel needs tools, operations
	// and generated toolpaths, and the examples already carry them.
	{
		id: 'operations-add-menu',
		asset: 'cam-setup/working-with-operations/add-menu.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			// With nothing selected the menu is only the unavailable list; a subtract
			// feature is what makes it show the operations it can actually offer.
			await page.getByText('Rect 2', { exact: true }).first().click()
			await page.waitForTimeout(1200)
			await page.getByRole('button', { name: /^Add$/ }).first().click()
			await page.waitForSelector('.cam-add-menu')
			await page.waitForTimeout(800)
			// Each row collapses to its title; opening one shows the info card and key
			// points, which is the part of the menu worth documenting.
			await page.evaluate(() => {
				const row = [...document.querySelectorAll('.cam-add-menu *')].find(
					(e) => e.children.length === 0 && e.textContent.trim() === 'Pocket',
				)
				row?.closest('button, [role=button], div')?.click()
			})
			await page.waitForTimeout(1200)
		},
		clip: clipDialog('.cam-add-menu', 24),
	},
	{
		id: 'operations-list-status',
		asset: 'cam-setup/working-with-operations/operation-list.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: CAM_OPS,
		async steps(page) {
			// With nothing selected the properties half of the panel is an empty prompt.
			await page.getByText('Pocket Rough', { exact: true }).first().click()
			await page.waitForTimeout(2000)
		},
		clip: clipCamPanel,
	},
	{
		id: 'cam-plan-recommendations',
		asset: 'cam-setup/cam-plan/recommendations.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await page.getByRole('button', { name: /^Plan$/ }).first().click()
			await page.waitForSelector('.dialog--cam-plan')
			// The plan is computed after the dialog opens.
			await page.waitForTimeout(3500)
		},
		clip: clipDialog('.dialog--cam-plan', 0),
	},
	{
		id: 'tool-library-management',
		asset: 'cam-setup/tool-library/tool-management.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: CAM_TOOLS,
		async steps(page) {
			await page.getByRole('tab', { name: /^Tools$/ }).click()
			await page.waitForTimeout(1800)
		},
		// The page only needs the list and its actions, and the panel reserves a lot of
		// empty height below three tools.
		clip: clipCamList('60° V-Bit'),
	},

	{
		id: 'machines-library-editor',
		asset: 'cam-setup/machines/machine-editor.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await page.evaluate(() => document.querySelector('.tree-row--project')?.click())
			await page.waitForTimeout(1200)
			await page.getByText(/Manage machines/).first().click()
			await page.waitForSelector('.dialog--machine-manager')
			await page.waitForTimeout(1200)
			// Built-in definitions are read-only, so the editor is only reachable through
			// a duplicate. Duplicating opens the editor on the copy.
			const clickIn = (starts) =>
				page.evaluate((t) => {
					const el = [...document.querySelectorAll('.dialog--machine-manager button')].find(
						(b) => b.textContent.trim().startsWith(t),
					)
					if (!el) throw new Error(`no machine-manager button starting ${t}`)
					el.click()
				}, starts)
			await clickIn('GRBL 1.1')
			await page.waitForTimeout(1000)
			await clickIn('Duplicate to edit')
			await page.waitForTimeout(2500)
		},
		clip: clipDialog('.dialog:has-text("Edit machine")', 0),
	},
	{
		id: 'tabs-crossing-shapes',
		asset: 'cam-setup/tabs/tab-crossings.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		async steps(page) {
			// One tab of each shape, so the page can show what the toggle changes.
			const setShape = async (tab, shape) => {
				await page.getByText(tab, { exact: true }).first().click()
				await page.waitForTimeout(1200)
				await page.evaluate((s) => {
					const el = [...document.querySelectorAll('.panel-left button')].find(
						(b) => b.textContent.trim() === s,
					)
					el?.click()
				}, shape)
				await page.waitForTimeout(1200)
			}
			await setShape('Rect 1 Tab', 'Rectangular')
			await setShape('Rect 1 Tab 2', 'Smooth')
			// Only the route that carries the tabs, so the gaps they leave are legible.
			await page.evaluate(() => {
				const click = (name) => {
					const el = [...document.querySelectorAll('button')].find(
						(b) => (b.getAttribute('aria-label') ?? '') === name,
					)
					if (el) el.click()
				}
				click('Hide all toolpaths')
			})
			await page.waitForTimeout(1200)
			await page.evaluate(() => {
				const el = [...document.querySelectorAll('button')].find(
					(b) => (b.getAttribute('aria-label') ?? '') === 'Show toolpath for Edge route outside Rough',
				)
				el?.click()
			})
			await page.waitForTimeout(2500)
			// Selecting them all is what shows the bulk-edit fields.
			await page.evaluate(() => {
				const el = [...document.querySelectorAll('button')].find(
					(b) => (b.getAttribute('aria-label') ?? '') === 'Select all tabs',
				)
				el?.click()
			})
			await page.waitForTimeout(2000)
		},
		clip: clipWorkspaceLeft,
	},
	{
		id: 'operations-generation-menu',
		asset: 'cam-setup/working-with-operations/generation-menu.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await page.evaluate(() => {
				const el = [...document.querySelectorAll('button')].find((b) =>
					/Toolpath generation settings/.test(b.getAttribute('aria-label') ?? ''),
				)
				el?.click()
			})
			await page.waitForSelector('.cam-generation-menu')
			await page.waitForTimeout(1000)
		},
		clip: clipDialog('.cam-generation-menu', 24),
	},
	{
		id: 'clamps-avoidance-warning',
		asset: 'cam-setup/clamps-and-clearances/clamp-avoidance.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			// The example's own clamps sit clear of every toolpath, so the collision has to
			// be built: place a clamp straddling the outside route on the left edge.
			const box = await canvasRect(page)
			const panelText = () =>
				page.evaluate(() => document.querySelector('.canvas-workflow-panel')?.innerText ?? '')
			const cornerAt = async (fx, fy) => {
				const before = await panelText()
				for (let i = 0; i < 4; i++) {
					await page.mouse.move(box.x + box.w * fx, box.y + box.h * fy)
					await page.waitForTimeout(350)
					await page.mouse.click(box.x + box.w * fx, box.y + box.h * fy)
					await page.waitForTimeout(800)
					if ((await panelText()) !== before) return
				}
				throw new Error(`clamp corner at ${fx},${fy} never registered`)
			}
			await page.locator('.tree-row--clamps').first().hover()
			await page.waitForTimeout(500)
			await page.getByRole('button', { name: 'Add clamp' }).click()
			await page.waitForSelector('.canvas-workflow-panel')
			await page.waitForTimeout(600)
			await cornerAt(0.1, 0.4)
			await cornerAt(0.21, 0.58)
			// The tool stays armed for the next clamp; dismiss it so the panel is not in shot.
			await page.keyboard.press('Escape')
			await page.waitForTimeout(1500)
			// A new clamp defaults to Z top 0.315, which is inside the 0.75 stock, so it reads
			// as an obstruction in the material rather than workholding standing on it. The
			// example's own clamps use 1.
			await page.getByText('Clamp 3', { exact: true }).first().click()
			await page.waitForTimeout(1200)
			await setNumberField(page, '.panel-left .z-range-slider__field--top', '1')
			await page.waitForTimeout(2000)
			await page.waitForFunction(
				() =>
					[...document.querySelectorAll('button')].some((b) =>
						/Toolpaths up to date/.test(b.getAttribute('aria-label') ?? ''),
					),
				null,
				{ timeout: 300000 },
			)
			await page.waitForTimeout(2500)
			await page.evaluate(() => {
				const el = [...document.querySelectorAll('button')].find(
					(b) => (b.getAttribute('aria-label') ?? '') === 'Hide all toolpaths',
				)
				el?.click()
			})
			await page.waitForTimeout(1200)
			await page.evaluate(() => {
				const el = [...document.querySelectorAll('button')].find(
					(b) =>
						(b.getAttribute('aria-label') ?? '') ===
						'Show toolpath for Edge route outside Rough',
				)
				el?.click()
			})
			await page.waitForTimeout(2000)
			// Selecting the operation is what puts its warnings on screen.
			await page.getByText('Edge route outside Rough', { exact: true }).first().click()
			await page.waitForTimeout(2500)
		},
		clip: clipCanvasAndCam,
	},
	{
		id: 'tool-library-import',
		asset: 'cam-setup/tool-library/import-dialog.png',
		fixture: 'PureCutCNC',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await page.getByRole('tab', { name: /^Tools$/ }).click()
			await page.waitForTimeout(1500)
			await page.getByRole('button', { name: /Import from library/ }).click()
			await page.waitForSelector('.dialog--tool-library')
			await page.waitForTimeout(1500)
		},
		clip: clipDialog('.dialog--tool-library', 0),
	},
	// --- Design: importing ---
	// The 2D and 3D fixtures are authored here rather than downloaded, so the repository
	// carries no third-party model licence. import-rapid.obj is the exception: it is
	// public domain and earns its size by arriving offset from the origin, which is what
	// the Orientation controls are for.
	{
		id: 'import-2d-dialog',
		asset: 'design/importing-2d/import-dialog.png',
		viewport: { width: 1440, height: 900 },
		steps: (page) => importFile(page, 'bracket.svg'),
		clip: clipDialog('.dialog--import', 40),
	},
	{
		id: 'import-svg-summary',
		asset: 'design/importing-2d/svg-summary.png',
		viewport: { width: 1440, height: 900 },
		async steps(page) {
			await importFile(page, 'bracket.svg')
			await page.getByTestId('import-geometry-mode').selectOption('solid-regions')
			await page.waitForTimeout(900)
		},
		clip: clipDialog('.dialog--import', 40),
	},
	{
		id: 'import-dxf-layers',
		asset: 'design/importing-2d/dxf-layers.png',
		viewport: { width: 1440, height: 900 },
		steps: (page) => importFile(page, 'bracket.dxf'),
		clip: clipDialog('.dialog--import', 40),
	},
	{
		id: 'import-project-folders',
		asset: 'design/importing-2d/project-folders.png',
		viewport: { width: 1440, height: 900 },
		steps: async (page) =>
			importFile(page, await appFile('t-style-body.camj', 'examples/t-style-body.camj')),
		clip: clipDialog('.dialog--import', 40),
	},
	{
		id: 'import-3d-multibody',
		asset: 'design/importing-3d-models/multi-body-import.png',
		viewport: { width: 1440, height: 900 },
		storage: SPLIT_TREE,
		async steps(page) {
			await importFile(page, 'three-bodies.obj')
			await sourceUnits(page).selectOption('inch')
			await page.waitForTimeout(500)
			await page.getByRole('button', { name: /^Import$/ }).click()
			// The three solids have to be built and drawn before the tree settles.
			await page.waitForTimeout(6000)
			await page.getByRole('tab', { name: /3D view/i }).click()
			await page.waitForTimeout(3000)
		},
		clip: null, // tree and 3D view together are the subject
	},
	{
		id: 'import-step-settings',
		asset: 'design/importing-3d-models/step-settings.png',
		viewport: { width: 1440, height: 900 },
		steps: (page) => importFile(page, 'bracket.step'),
		clip: clipDialog('.dialog--import', 40),
	},
	{
		id: 'import-model-orientation',
		asset: 'design/importing-3d-models/model-orientation.png',
		viewport: { width: 1440, height: 900 },
		// The orientation section runs to Lift and Reset; the default split cuts it off.
		storage: SHORT_TREE,
		async steps(page) {
			await importFile(page, 'rapid.obj')
			await sourceUnits(page).selectOption('mm')
			await page.waitForTimeout(500)
			await page.getByRole('button', { name: /^Import$/ }).click()
			await page.waitForTimeout(8000)
			await page.getByRole('tab', { name: /3D view/i }).click()
			await page.waitForTimeout(2500)
			await page.getByText('rapid', { exact: false }).first().click()
			await page.waitForTimeout(1200)
			// The orientation controls live in a collapsed section of the model's properties.
			await page.getByText('3D ORIENTATION', { exact: false }).first().click()
			await page.waitForTimeout(900)
		},
		clip: clipWorkspaceLeft,
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
			// It has to be one clear move onto the point from somewhere else: nudging a few
			// pixels leaves the crosshair drawn but no label, which is how the first version
			// of this shot lost it.
			await moveTo(page, 0.35, 0.45)
			await page.waitForTimeout(400)
			await moveTo(page, 0.49, 0.28)
			await page.waitForTimeout(700)
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

		if (recipe.fixture?.startsWith('site/fixtures/')) {
			// A project committed here rather than bundled with the app. Open project builds
			// a transient file input, so it is driven through the file chooser event.
			await page.getByRole('button', { name: /^close$/i }).first().click().catch(() => {})
			await page.waitForTimeout(600)
			const [chooser] = await Promise.all([
				page.waitForEvent('filechooser'),
				page.getByRole('button', { name: 'Open project' }).click(),
			])
			await chooser.setFiles(join(repoRoot, recipe.fixture))
			await page.waitForFunction(
				() => !/Start your part/.test(document.body.innerText),
				null,
				{ timeout: 120000 },
			)
			await page.waitForTimeout(6000)
		} else if (recipe.fixture) {
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
		const fixture = !recipe.fixture
		? 'Empty project'
		: recipe.fixture.startsWith('site/fixtures/')
			? recipe.fixture
			: `Example: ${recipe.fixture}`
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
if (!APP_COMMIT) {
	console.log('  ! Could not read the app repository HEAD, so "appCommit" is not shown below.')
	console.log('    Set PURECUT_APP_REPO to the app checkout and re-run, or the records will be wrong.')
}
for (const result of results.filter((r) => r.ok)) {
	console.log(`  ${result.recipe.asset}`)
	const commit = APP_COMMIT ? `"appCommit": "${APP_COMMIT}", ` : ''
	console.log(`    ${commit}"fixture": ${JSON.stringify(result.fixture)}, "viewport": "${result.viewport}", "theme": "dark", "locale": "en"`)
}
if (failed.length) process.exit(1)
