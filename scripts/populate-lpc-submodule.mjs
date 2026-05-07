#!/usr/bin/env node
// Populates E:/code/assets/lpc/lpc-jaidynreiman-assets/characters/ with base animation
// frames for every JaidynReiman-credited ULPC sheet definition.
//
// Priority per frame:
//   1. lpc-jaidynreiman-sprites/characters/{layerPath}/{anim}.png
//   2. lpc-jaidynreiman-sprites/characters/updates/{layerPath}/{anim}.png
//   3. Universal-LPC-Spritesheet-Character-Generator/spritesheets/{layerPath}/{anim}.png
//
// Run with: node scripts/populate-lpc-submodule.mjs

import { readFileSync, copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHEET_DEFS  = 'E:/code/assets/lpc/Universal-LPC-Spritesheet-Character-Generator/sheet_definitions';
const JR_SPRITES  = 'E:/code/assets/lpc/lpc-jaidynreiman-sprites';
const ULPC_SHEETS = 'E:/code/assets/lpc/Universal-LPC-Spritesheet-Character-Generator/spritesheets';
const DEST        = 'E:/code/assets/lpc/lpc-jaidynreiman-assets/characters';

const ANIMATIONS = [
  'backslash', 'climb', 'combat_idle', 'emote', 'halfslash',
  'hurt', 'idle', 'jump', 'run', 'shoot',
  'sit', 'slash', 'spellcast', 'thrust', 'walk',
];

// ── helpers ─────────────────────────────────────────────────────────────────

function walkDir(dir, base = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...walkDir(join(dir, entry.name), rel));
    else if (entry.name.endsWith('.json')) results.push(rel);
  }
  return results;
}

/** Extract all unique layer paths (trailing slash stripped) from a sheet def. */
function layerPaths(sheetDef) {
  const paths = new Set();
  for (const key of ['layer_1', 'layer_2', 'layer_3']) {
    const layer = sheetDef[key];
    if (!layer) continue;
    const { zPos: _z, ...bodyPaths } = layer;
    for (const raw of Object.values(bodyPaths)) {
      // Skip template paths (e.g. "head/faces/${head}/anger/")
      if (raw.includes('${')) continue;
      paths.add(raw.replace(/\/$/, ''));
    }
  }
  return [...paths];
}

/** Return the first existing source file path, or null. */
function findSource(layerPath, anim) {
  const candidates = [
    join(JR_SPRITES, 'characters', layerPath, `${anim}.png`),
    join(JR_SPRITES, 'characters', 'updates', layerPath, `${anim}.png`),
    join(ULPC_SHEETS, layerPath, `${anim}.png`),
  ];
  return candidates.find(existsSync) ?? null;
}

// ── main ────────────────────────────────────────────────────────────────────

let copied = 0;
let missing = 0;
let skippedSheets = 0;
const missingLog = [];

for (const relPath of walkDir(SHEET_DEFS)) {
  let content;
  try { content = JSON.parse(readFileSync(join(SHEET_DEFS, relPath), 'utf-8')); }
  catch { continue; }

  const allCredits = content.credits ?? [];
  const hasJaidyn = allCredits.some(
    c => Array.isArray(c.authors) && c.authors.includes('JaidynReiman')
  );
  if (!hasJaidyn) { skippedSheets++; continue; }

  for (const layerPath of layerPaths(content)) {
    const destDir = join(DEST, layerPath);

    for (const anim of ANIMATIONS) {
      const src = findSource(layerPath, anim);
      if (!src) {
        missingLog.push(`${layerPath}/${anim}.png`);
        missing++;
        continue;
      }

      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, join(destDir, `${anim}.png`));
      copied++;
    }
  }
}

console.log(`Copied  : ${copied} frames`);
console.log(`Missing : ${missing} frames`);
console.log(`Skipped : ${skippedSheets} sheets (no JaidynReiman credit)`);

if (missingLog.length) {
  console.log('\nMissing frames (not found in any source):');
  missingLog.forEach(p => console.log(`  ${p}`));
}
