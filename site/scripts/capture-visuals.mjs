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

		await page.getByRole('button', { name: FIXTURES[recipe.fixture] }).click()
		// The example has to finish building its model before anything is worth capturing.
		await page.waitForTimeout(2500)

		if (recipe.steps) await recipe.steps(page)
		await page.waitForTimeout(800)

		const target = join(assetRoot, recipe.asset)
		mkdirSync(dirname(target), { recursive: true })
		const clip = recipe.clip ? await recipe.clip(page) : undefined
		await page.screenshot({ path: target, clip })

		const { width, height } = recipe.viewport
		return { ok: true, viewport: `${width}x${height}@2x`, fixture: `Example: ${recipe.fixture}` }
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
