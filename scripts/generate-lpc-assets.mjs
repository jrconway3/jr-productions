#!/usr/bin/env node
// One-time script: generates data/lpc/**/*.json asset entries from ULPC sheet_definitions
// that credit JaidynReiman. Run with: node scripts/generate-lpc-assets.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SHEET_DEFS_ROOT =
  'E:/code/assets/lpc/Universal-LPC-Spritesheet-Character-Generator/sheet_definitions';
const DATA_LPC_ROOT = join(PROJECT_ROOT, 'data', 'lpc');

// Collapse specific deep sheet_def subdirs into a parent data/lpc dir
const DIR_REMAPS = {
  'headwear/accessories/glasses': 'headwear/accessories',
  'weapons/shields/heater/pattern': 'weapons/shields/heater',
  'weapons/shields/heater/revised_pattern': 'weapons/shields/heater',
};

function walkDir(dir, base = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...walkDir(join(dir, entry.name), rel));
    else if (entry.name.endsWith('.json')) results.push(rel);
  }
  return results;
}

function buildLayers(sheetDef) {
  const layers = [];
  const layerKeys = [
    ['layer_1', 'fg'],
    ['layer_2', 'bg'],
    ['layer_3', 'fg2'],
  ];

  for (const [key, defaultId] of layerKeys) {
    const config = sheetDef[key];
    if (!config) continue;

    const { zPos, ...bodyPaths } = config;

    // Group body types by their resolved path
    const pathGroups = {};
    for (const [bodyType, rawPath] of Object.entries(bodyPaths)) {
      const path = rawPath.replace(/\/$/, '');
      if (!pathGroups[path]) pathGroups[path] = [];
      pathGroups[path].push(bodyType);
    }

    const uniquePaths = Object.keys(pathGroups);

    if (uniquePaths.length === 1) {
      const path = uniquePaths[0];
      const id = path.includes('/fg') ? 'fg' : path.includes('/bg') ? 'bg' : defaultId;
      layers.push({ id, zPos, path });
    } else {
      // Different paths per body type — one entry per group
      for (const [path, bodyTypes] of Object.entries(pathGroups)) {
        const seg = path.split('/').pop();
        const id = seg === 'fg' ? 'fg' : seg === 'bg' ? 'bg' : seg;
        layers.push({ id, zPos, path, body_types: bodyTypes });
      }
    }
  }

  return layers.length > 0 ? layers : undefined;
}

function toLabel(dirName) {
  return dirName
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ensureDir(dirPath, relFromLpc) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
    // Create a minimal meta.json stub so CategoryService can read it
    const label = toLabel(relFromLpc.split('/').pop());
    writeFileSync(
      join(dirPath, 'meta.json'),
      JSON.stringify({ label, description: '', priority: 100, accent: 'saturated' }, null, 2)
    );
    return true;
  }
  return false;
}

function processSheetDef(relPath) {
  const fullPath = join(SHEET_DEFS_ROOT, relPath);
  let content;
  try {
    content = JSON.parse(readFileSync(fullPath, 'utf-8'));
  } catch {
    return null;
  }

  const allCredits = content.credits ?? [];
  const hasJaidyn = allCredits.some(
    (c) => Array.isArray(c.authors) && c.authors.includes('JaidynReiman')
  );
  if (!hasJaidyn) return null;

  const filename = basename(relPath, '.json');
  const dirPart = dirname(relPath).replace(/\\/g, '/');
  const outputSubdir = DIR_REMAPS[dirPart] ?? dirPart;

  // Collect unique licenses across all credit entries
  const licenses = [...new Set(allCredits.flatMap((c) => c.licenses ?? []))];

  // Credits: preserve all entries, include notes only when present
  const credits = allCredits.map((c) => {
    const entry = { authors: c.authors ?? [], urls: c.urls ?? [] };
    if (c.notes) entry.notes = c.notes;
    return entry;
  });

  // Body types from layer_1 keys (strip zPos)
  let body_types;
  if (content.layer_1) {
    const { zPos: _z, ...paths } = content.layer_1;
    body_types = Object.keys(paths);
  }

  // Download: last URL from the first credit entry that lists JaidynReiman
  const jaidynCredit = allCredits.find(
    (c) => Array.isArray(c.authors) && c.authors.includes('JaidynReiman')
  );
  const download =
    jaidynCredit?.urls?.length ? jaidynCredit.urls[jaidynCredit.urls.length - 1] : undefined;

  const asset = {
    id: filename,
    name: content.name,
    category: 'lpc',
    subcategory: outputSubdir,
    type: 'spritesheet',
    ...(content.tags?.length && { tags: content.tags }),
    ...(licenses.length && { license: licenses.join(', ') }),
    credits,
    ...(body_types?.length && { body_types }),
    ...(content.animations?.length && { animations: content.animations }),
    ...(content.variants?.length && { variants: content.variants }),
  };

  const layers = buildLayers(content);
  if (layers) asset.layers = layers;

  asset.preview = '';
  if (download) asset.download = download;

  return { asset, outputSubdir };
}

// ── Main ────────────────────────────────────────────────────────────────────
let generated = 0;
let skipped = 0;
const newDirs = [];

for (const relPath of walkDir(SHEET_DEFS_ROOT)) {
  const result = processSheetDef(relPath);
  if (!result) { skipped++; continue; }

  const { asset, outputSubdir } = result;
  const outputDir = join(DATA_LPC_ROOT, outputSubdir);
  const outputFile = join(outputDir, `${asset.id}.json`);

  if (ensureDir(outputDir, outputSubdir)) {
    newDirs.push(outputSubdir);
  }

  writeFileSync(outputFile, JSON.stringify(asset, null, 2));
  generated++;
}

console.log(`Generated : ${generated} asset JSONs`);
console.log(`Skipped   : ${skipped} (no JaidynReiman credit)`);
if (newDirs.length) {
  console.log(`\nNew dirs created (meta.json stubs added — review labels/priority):`);
  newDirs.forEach((d) => console.log(`  data/lpc/${d}`));
}
