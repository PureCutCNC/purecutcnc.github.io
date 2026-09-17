#!/usr/bin/env node
// Checks the manual coverage planning data (issue #21) and prints summaries or
// filtered views of it.
//
//   node scripts/check-coverage.mjs                      validate, then print the summary
//   node scripts/check-coverage.mjs --where coverage=missing,priority=release-critical
//                                                        list the matching capabilities
//   node scripts/check-coverage.mjs --sections --where disposition=rewrite
//                                                        list matching legacy guide sections
//
// Files (repository root):
//   planning/manual-coverage.csv          one row per user-facing capability
//   planning/legacy-guide-inventory.csv   one row per section of the hand-maintained guide
//
// While the hand-maintained guide still exists, the inventory must list exactly
// the sections its HTML contains. Once guide/ and quickstart.html are removed,
// that comparison is skipped.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COVERAGE_FILE = path.join(REPO_ROOT, 'planning/manual-coverage.csv');
const INVENTORY_FILE = path.join(REPO_ROOT, 'planning/legacy-guide-inventory.csv');

const COVERAGE_HEADER = ['id', 'area', 'capability', 'ui_surface', 'legacy_guide', 'coverage', 'gaps', 'priority', 'since_v040', 'media', 'evidence', 'destination', 'reviewer', 'workstream'];
const INVENTORY_HEADER = ['legacy_page', 'anchor', 'heading', 'words', 'screenshots', 'assessment', 'disposition', 'destination', 'workstream', 'capabilities', 'notes'];

const ENUMS = {
	area: ['start-here', 'fundamentals', 'design', 'cam-setup', 'operations', 'strategies', 'verify-export', 'reference'],
	coverage: ['accurate', 'incomplete', 'stale', 'missing'],
	priority: ['release-critical', 'reference'],
	since_v040: ['no', 'new', 'changed'],
	workstream: ['W1', 'W2', 'W3', 'W4', 'W5'],
	assessment: ['accurate', 'incomplete', 'stale'],
	disposition: ['migrate', 'rewrite', 'split', 'merge', 'drop'],
};

/**
 * Wave 2 page ownership: the first matching rule owns a destination page, so
 * two workstreams can never be assigned the same file.
 */
export const PAGE_OWNERS = [
	['/guide/', 'W1', 'exact'],
	['/quickstart/', 'W1', 'exact'],
	['/guide/start-here/', 'W1'],
	['/guide/fundamentals/', 'W1'],
	['/guide/reference/themes/', 'W1'],
	['/guide/reference/languages/', 'W1'],
	['/guide/reference/keyboard-shortcuts/', 'W1'],
	['/guide/reference/glossary/', 'W1'],
	['/guide/reference/privacy-and-data/', 'W1'],
	['/guide/design/', 'W2'],
	['/guide/cam-setup/', 'W3'],
	['/guide/operations/3d-', 'W4'],
	['/guide/operations/', 'W3'],
	['/guide/strategies/', 'W4'],
	['/guide/verify-export/', 'W5'],
	['/guide/reference/', 'W5'],
];

const { values: args } = parseArgs({
	options: {
		where: { type: 'string' },
		sections: { type: 'boolean', default: false },
	},
});

const errors = [];
const fail = (message) => errors.push(message);

function parseCsv(file) {
	const text = readFileSync(file, 'utf8');
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && text[i + 1] === '\n') i += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += char;
		}
	}
	if (field || row.length) rows.push([...row, field]);
	return rows;
}

function readTable(file, header) {
	const label = path.relative(REPO_ROOT, file);
	const [head, ...body] = parseCsv(file);
	if (head.join(',') !== header.join(',')) fail(`${label}: header must be ${header.join(',')}`);
	return body.map((cells, index) => {
		if (cells.length !== header.length) fail(`${label}:${index + 2}: expected ${header.length} fields, found ${cells.length}`);
		return Object.fromEntries(header.map((name, column) => [name, (cells[column] ?? '').trim()]));
	});
}

const list = (value) => value.split(';').map((item) => item.trim()).filter(Boolean);
const pageOf = (destination) => destination.split('#')[0];

export function ownerOf(destination) {
	const page = pageOf(destination);
	for (const [prefix, owner, mode] of PAGE_OWNERS) {
		if (mode === 'exact' ? page === prefix : page.startsWith(prefix)) return owner;
	}
	return null;
}

function checkEnum(label, row, field) {
	if (!ENUMS[field].includes(row[field])) fail(`${label}: ${field} "${row[field]}" is not one of ${ENUMS[field].join(', ')}`);
}

function checkDestination(label, row) {
	if (!/^\/(guide|quickstart)\/([a-z0-9-]+\/)*(#[a-z0-9-]+)?$/.test(row.destination)) {
		fail(`${label}: destination "${row.destination}" must be a site path with a trailing slash and an optional #anchor`);
		return;
	}
	const owner = ownerOf(row.destination);
	if (owner !== row.workstream) fail(`${label}: ${pageOf(row.destination)} belongs to ${owner ?? 'no workstream'}, not ${row.workstream}`);
}

/** Sections of the hand-maintained guide, read from its HTML while it exists. */
function legacySections() {
	const guideDir = path.join(REPO_ROOT, 'guide');
	const quickstart = path.join(REPO_ROOT, 'quickstart.html');
	if (!existsSync(guideDir) || !existsSync(quickstart)) return null;
	const keys = new Set();
	for (const file of readdirSync(guideDir).filter((name) => name.endsWith('.html'))) {
		const html = readFileSync(path.join(guideDir, file), 'utf8');
		for (const match of html.matchAll(/<section class="guide-section" id="([^"]+)"/g)) {
			keys.add(`${file.replace(/\.html$/, '')}#${match[1]}`);
		}
	}
	for (const match of readFileSync(quickstart, 'utf8').matchAll(/<div class="step" id="([^"]+)"/g)) {
		keys.add(`quickstart#${match[1]}`);
	}
	return keys;
}

const inventoryKey = (row) => `${row.legacy_page.replace(/^guide\//, '')}#${row.anchor}`;

const coverage = readTable(COVERAGE_FILE, COVERAGE_HEADER);
const inventory = readTable(INVENTORY_FILE, INVENTORY_HEADER);
const sectionKeys = new Set(inventory.map(inventoryKey));
const referenced = new Map();

const ids = new Set();
for (const row of coverage) {
	const label = `manual-coverage.csv ${row.id || '(no id)'}`;
	if (!/^[a-z]+\.[a-z0-9-]+$/.test(row.id)) fail(`${label}: id must look like area.name`);
	if (ids.has(row.id)) fail(`${label}: duplicate id`);
	ids.add(row.id);
	for (const field of ['area', 'coverage', 'priority', 'since_v040', 'workstream']) checkEnum(label, row, field);
	for (const field of ['capability', 'ui_surface', 'evidence', 'reviewer', 'media']) {
		if (!row[field]) fail(`${label}: ${field} is empty`);
	}
	const legacy = list(row.legacy_guide);
	if ((row.coverage === 'missing') !== (legacy.length === 0)) {
		fail(`${label}: coverage "missing" must go with an empty legacy_guide, and only then`);
	}
	if (row.coverage !== 'accurate' && !row.gaps) fail(`${label}: describe the gaps for a ${row.coverage} capability`);
	for (const key of legacy) {
		if (!sectionKeys.has(key)) fail(`${label}: legacy_guide ${key} is not in legacy-guide-inventory.csv`);
		referenced.set(key, [...(referenced.get(key) ?? []), row.id]);
	}
	checkDestination(label, row);
}

const seen = new Set();
for (const row of inventory) {
	const key = inventoryKey(row);
	const label = `legacy-guide-inventory.csv ${key}`;
	if (seen.has(key)) fail(`${label}: duplicate section`);
	seen.add(key);
	for (const field of ['assessment', 'disposition', 'workstream']) checkEnum(label, row, field);
	if (!/^\d+$/.test(row.words)) fail(`${label}: words must be a number`);
	checkDestination(label, row);
	const expected = (referenced.get(key) ?? []).join(';');
	if (row.capabilities !== expected) fail(`${label}: capabilities must be "${expected}" (the rows whose legacy_guide lists it)`);
	if (!expected) fail(`${label}: no capability row references this section`);
}

const legacy = legacySections();
if (legacy) {
	for (const key of legacy) if (!sectionKeys.has(key)) fail(`guide section ${key} is missing from legacy-guide-inventory.csv`);
	for (const key of sectionKeys) if (!legacy.has(key)) fail(`legacy-guide-inventory.csv lists ${key}, which the guide no longer has`);
}

if (errors.length) {
	for (const message of errors) console.error(`error: ${message}`);
	console.error(`\n${errors.length} error(s)`);
	process.exit(1);
}

function matches(row, where) {
	return where.every(([field, value]) => (row[field] ?? '').split(';').includes(value));
}

if (args.where) {
	const where = args.where.split(',').map((pair) => pair.split('='));
	const rows = (args.sections ? inventory : coverage).filter((row) => matches(row, where));
	for (const row of rows) {
		if (args.sections) console.log(`${inventoryKey(row).padEnd(46)} ${row.assessment.padEnd(10)} ${row.disposition.padEnd(8)} ${row.destination}`);
		else console.log(`${row.id.padEnd(30)} ${row.coverage.padEnd(10)} ${row.workstream} ${row.destination}  ${row.capability}`);
	}
	console.log(`\n${rows.length} ${args.sections ? 'section' : 'capabilit'}${args.sections ? (rows.length === 1 ? '' : 's') : rows.length === 1 ? 'y' : 'ies'}`);
	process.exit(0);
}

function table(rows, rowField, columnField, columns) {
	const keys = [...new Set(rows.map((row) => row[rowField]))];
	const width = Math.max(rowField.length, ...keys.map((key) => key.length)) + 2;
	const lines = [`${rowField.padEnd(width)}${columns.map((c) => c.padStart(12)).join('')}${'total'.padStart(8)}`];
	for (const key of keys) {
		const subset = rows.filter((row) => row[rowField] === key);
		lines.push(`${key.padEnd(width)}${columns.map((c) => String(subset.filter((row) => row[columnField] === c).length).padStart(12)).join('')}${String(subset.length).padStart(8)}`);
	}
	lines.push(`${'total'.padEnd(width)}${columns.map((c) => String(rows.filter((row) => row[columnField] === c).length).padStart(12)).join('')}${String(rows.length).padStart(8)}`);
	return lines.join('\n');
}

console.log(`Capabilities by area and coverage\n\n${table(coverage, 'area', 'coverage', ENUMS.coverage)}\n`);
console.log(`Release-critical capabilities by workstream\n\n${table(coverage.filter((row) => row.priority === 'release-critical'), 'workstream', 'coverage', ENUMS.coverage)}\n`);
console.log(`Changed since v0.4.0 by coverage\n\n${table(coverage.filter((row) => row.since_v040 !== 'no'), 'since_v040', 'coverage', ENUMS.coverage)}\n`);
console.log(`Legacy guide sections by disposition and assessment\n\n${table(inventory, 'disposition', 'assessment', ENUMS.assessment)}\n`);
const pages = new Set(coverage.map((row) => pageOf(row.destination)));
console.log(`${coverage.length} capabilities, ${inventory.length} legacy sections, ${pages.size} proposed pages. Checks passed.`);
