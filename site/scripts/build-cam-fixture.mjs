// Build site/fixtures/cam-demo.camj, the project the CAM captures run on.
//
//   node scripts/build-cam-fixture.mjs
//
// The bundled examples carry five of the eleven operation kinds and no 3D model, so
// engrave, edge route inside, surface clean and the three 3D-surface operations have
// nothing to be shot against. This assembles one project that can demonstrate all of
// them, from geometry authored in this repository:
//
//   cam-demo.svg  a filled plate (add, a top face to surface clean), a filled teardrop
//                 (subtract, to pocket and to route inside) and open stroke-only curves
//                 (lines, to engrave)
//   cam-demo.obj  a relief to rough, finish and clean up in 3D
//
// It drives the app the way a reader would, so the result is a project they could have
// built themselves. Re-run it if the fixture needs rebuilding; do not hand-edit the
// .camj, which embeds the mesh.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const siteRoot = join(here, '..')
const fixtures = join(siteRoot, 'fixtures')
const APP_URL = process.env.PURECUT_APP_URL ?? 'http://localhost:1420/'
const TOOLS = ['1/4" Endmill', '1/8" Endmill', '1/8" Ball Endmill', '1/4" 30° V-Bit']

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const step = (m) => console.log(`  ${m}`)

// The app saves through the File System Access picker when it is available, which
// cannot be driven from here and simply hangs. Removing it takes the download path,
// which Playwright can capture.
await page.addInitScript(() => {
	delete window.showSaveFilePicker
})

await page.goto(APP_URL)
await page.waitForTimeout(3500)
await page.getByRole('button', { name: /^close$/i }).first().click().catch(() => {})
await page.waitForTimeout(800)

// 1. A blank imperial project, so the stock is the familiar 4 x 3 x 0.75 in.
await page.getByRole('button', { name: 'New project' }).click()
await page.waitForTimeout(1500)
await page.getByText('Blank imperial', { exact: true }).first().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /^Create project$/ }).click()
await page.waitForTimeout(4000)
step('blank imperial project created')

async function importFixture(file, units) {
	await page.getByRole('button', { name: 'Import geometry' }).click()
	await page.waitForSelector('.dialog--import')
	await page.locator('input[type=file]').first().setInputFiles(join(fixtures, file))
	await page.waitForFunction(
		() => /Format/.test(document.querySelector('.dialog--import')?.innerText ?? ''),
		null,
		{ timeout: 60000 },
	)
	await page.waitForTimeout(1200)
	if (units) {
		await page
			.locator('.import-dialog__info-row', { hasText: 'Source units' })
			.locator('select')
			.selectOption(units)
		await page.waitForTimeout(800)
	}
	await page.getByRole('button', { name: /^Import$/ }).click()
	await page.waitForTimeout(9000)
	step(`imported ${file}`)
}

await importFixture('cam-demo.svg')
await importFixture('cam-demo.obj', 'inch')

// 2. Inset the plate. A feature whose top is flush with the stock top gives a surface
// clean nothing to remove — it reports "resolver produced no depth bands".
await page.getByText('Plate 2', { exact: true }).first().click()
await page.waitForTimeout(1500)
// A feature's properties open collapsed, so the Z fields do not exist yet.
await page.evaluate(() => {
	const head = [...document.querySelectorAll('.panel-left *')].find(
		(e) => e.children.length === 0 && /^instance$/i.test(e.textContent.trim()),
	)
	head?.click()
})
await page.waitForTimeout(1500)
await page.evaluate(() => {
	const input = document.querySelector('.panel-left .z-range-slider__field--top')
	if (!input) throw new Error('no Z top field on the plate')
	const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
	setter.call(input, '0.62')
	input.dispatchEvent(new Event('input', { bubbles: true }))
	input.dispatchEvent(new Event('change', { bubbles: true }))
	input.blur()
})
await page.waitForTimeout(2500)
const plateTop = await page.evaluate(
	() => document.querySelector('.panel-left .z-range-slider__field--top')?.value,
)
if (plateTop !== '0.62') throw new Error(`plate Z top is ${plateTop}, expected 0.62`)
step('plate inset to Z top 0.62')

// 3. Tools, so an operation has something to cut with.
await page.getByRole('tab', { name: /^Tools$/ }).click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: /Import from library/ }).click()
await page.waitForSelector('.dialog--tool-library')
await page.waitForTimeout(1500)
const picked = await page.evaluate((wanted) => {
	// Each row is a label carrying the checkbox and the tool's name in its own span;
	// reading the row's whole text picks up the specs and matches nothing.
	const hit = []
	for (const row of document.querySelectorAll('.dialog--tool-library .tl-row')) {
		const name = row.querySelector('.tl-row__name')?.textContent.trim() ?? ''
		if (!wanted.includes(name)) continue
		const box = row.querySelector('.tl-row__check')
		if (box && !box.checked) {
			box.click()
			hit.push(name)
		}
	}
	return hit
}, TOOLS)
if (picked.length !== TOOLS.length) {
	throw new Error(`selected ${picked.length} of ${TOOLS.length} tools: ${picked.join(', ')}`)
}
await page.waitForTimeout(1200)
// The action button counts the selection: "Import tool" becomes "Import 4 tools".
await page.getByRole('button', { name: /^Import \d* ?tools?$/ }).click()
await page.waitForTimeout(3000)
step(`imported tools: ${picked.join(', ') || 'none'}`)

// 4. Save. The browser platform falls back to a download when the File System Access
// API is missing, which is the case in headless Chromium.
const [download] = await Promise.all([
	page.waitForEvent('download', { timeout: 60000 }),
	page.getByRole('button', { name: 'Save project' }).click(),
])
const out = join(fixtures, 'cam-demo.camj')
await download.saveAs(out)
step(`saved ${out}`)

await browser.close()
