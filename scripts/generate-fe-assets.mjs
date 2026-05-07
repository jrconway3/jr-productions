#!/usr/bin/env node
// Generates JSON asset files for data/fe/ from fegba-lt-assets structure.
// Run with: node scripts/generate-fe-assets.mjs

import { writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FEGBA = 'E:/code/assets/fegba/fegba-lt-assets';
const DATA   = 'E:/code/websites/jr-productions/data/fe';

// ─── Utility ────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[\[\]{}()+]/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function writeJSON(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function listEntries(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
}

function listDirs(dir) {
  return listEntries(dir).filter(e => e.isDirectory()).map(e => e.name);
}

function listFiles(dir, extFilter) {
  return listEntries(dir)
    .filter(e => e.isFile() && (!extFilter || e.name.endsWith(extFilter)))
    .map(e => e.name);
}

function isWeaponDir(name) { return /^\d+\./.test(name); }
function isAsepriteDir(name) { return name.startsWith('[A]'); }

/** Extract class name from folder tag like [Myrmidon-Base] or [Wolf-Variant] */
function extractClass(folderName) {
  const m = folderName.match(/^\[([^\]]+?)(?:-Base|-Variant|-Reskin)\]/);
  if (!m) return null;
  return m[1].trim();
}

/**
 * Strip leading [Tag-Type] and [F]/[M] gender tags, move gender to end.
 * Strip trailing "by JaidynReiman".
 */
function extractDisplayName(folderName) {
  let gender = '';
  let name = folderName
    .replace(/^\[[^\]]+(?:-Base|-Variant|-Reskin)\]\s*/, '')  // strip class tag
    .replace(/^\[([FM])\]\s*/, (_, g) => { gender = g; return ''; }) // capture gender
    .replace(/\s+by JaidynReiman\s*$/i, '')
    .trim();
  if (gender && name) return `${name} (${gender})`;
  if (gender && !name) {
    // name was only gender, use class as name base
    const cls = extractClass(folderName);
    return cls ? `${cls} (${gender})` : `(${gender})`;
  }
  return name;
}

/** Get unique weapon types (first word) from numbered subdirs */
function extractWeaponTypes(dir) {
  const seen = new Set();
  for (const name of listDirs(dir)) {
    if (!isWeaponDir(name)) continue;
    const m = name.match(/^\d+\.\s*(\w+)/);
    if (m) seen.add(m[1].toLowerCase());
  }
  return [...seen];
}

/** Find first .gif recursively up to depth levels deep */
function findGif(dir, depth = 2) {
  if (depth === 0) return null;
  for (const e of listEntries(dir)) {
    if (e.isFile() && e.name.endsWith('.gif')) return join(dir, e.name);
    if (e.isDirectory() && depth > 1) {
      const found = findGif(join(dir, e.name), depth - 1);
      if (found) return found;
    }
  }
  return null;
}

// ─── Portraits ──────────────────────────────────────────────────────────────

let portraitCount = 0;

for (const tier of ['Main', 'Major', 'Minor']) {
  const tierDir = join(FEGBA, 'Portraits', tier);
  const subcategory = `portraits/${tier.toLowerCase()}`;

  for (const charName of listDirs(tierDir)) {
    const charDir = join(tierDir, charName);
    const pngs = listFiles(charDir, '.png');

    // Find preview GIF from Previews/ or previews/
    let preview = '';
    for (const previewSub of ['Previews', 'previews']) {
      const gifs = listFiles(join(charDir, previewSub), '.gif');
      if (gifs.length > 0) {
        const gif = gifs.find(g => /smile/i.test(g)) || gifs[0];
        preview = `Portraits/${tier}/${charName}/${previewSub}/${gif}`;
        break;
      }
    }

    // Extract variant suffix from filenames: strip "{Author} [tag] OC CharName " prefix
    const variants = pngs.map(f => {
      let name = f
        .replace(/^\{[^}]+\}(\s+\[[^\]]+\])?\s+OC\s+/i, '')
        .replace(/\.png$/i, '');
      if (name.toLowerCase().startsWith(charName.toLowerCase())) {
        name = name.slice(charName.length).trim();
      }
      return name || 'Final';
    });

    const id = `portrait-${slugify(charName)}`;
    writeJSON(join(DATA, subcategory, `${id}.json`), {
      id,
      name: charName,
      category: 'fe',
      subcategory,
      type: 'portrait',
      license: 'F2U/F2E',
      credits: [{ authors: ['JaidynReiman'] }],
      variants: variants.length > 0 ? variants : undefined,
      preview,
    });
    portraitCount++;
  }
}

console.log(`Portraits: ${portraitCount}`);

// ─── Battle Animations ───────────────────────────────────────────────────────

const BATTLE_DIR = join(FEGBA, 'Battle Animations');
let battleCount = 0;

function categorySlug(catName) {
  return slugify(catName.replace(/\s*-\s*/g, '-'));
}

function isLtAnimEntry(name) {
  return name.endsWith('.ltanim') || name.endsWith('.ltlegacyanim');
}

function processBattleVariant(variantDir, variantName, subcategory) {
  const weaponTypes = extractWeaponTypes(variantDir);
  // .ltanim/.ltlegacyanim can be files or directories (LT Maker bundles)
  const allEntries = listEntries(variantDir).map(e => e.name);
  const hasLtAnim = allEntries.some(isLtAnimEntry);

  if (weaponTypes.length === 0 && !hasLtAnim) return;

  const cls = extractClass(variantName);
  const displayName = extractDisplayName(variantName);
  const id = `ba-${slugify(variantName)}`.replace(/-+/g, '-').slice(0, 80);

  writeJSON(join(DATA, subcategory, `${id}.json`), {
    id,
    name: displayName,
    category: 'fe',
    subcategory,
    type: 'spritesheet',
    license: 'F2U/F2E',
    credits: [{ authors: ['JaidynReiman'] }],
    animated: true,
    ...(cls ? { class: cls } : {}),
    ...(weaponTypes.length > 0 ? { weapon_types: weaponTypes } : {}),
    preview: '',
    download: '',
  });
  battleCount++;
}

for (const catName of listDirs(BATTLE_DIR)) {
  // Skip [A] archive/template categories
  if (isAsepriteDir(catName)) continue;

  const catDir = join(BATTLE_DIR, catName);
  const subcategory = `battle-animations/${categorySlug(catName)}`;

  for (const groupName of listDirs(catDir)) {
    if (isAsepriteDir(groupName)) continue;

    const groupDir = join(catDir, groupName);
    const subdirs = listDirs(groupDir).filter(n => !isAsepriteDir(n));
    const directWeapons = subdirs.filter(isWeaponDir);
    const groupHasLtAnim = listEntries(groupDir).some(
      e => isLtAnimEntry(e.name)
    );

    // Group-level content (weapon dirs or LT anim files directly inside)
    if (directWeapons.length > 0 || groupHasLtAnim) {
      processBattleVariant(groupDir, groupName, subcategory);
    }

    // Variant subdirs (non-weapon, non-[A])
    for (const varName of subdirs) {
      if (isWeaponDir(varName)) continue;
      const varDir = join(groupDir, varName);
      try { if (!statSync(varDir).isDirectory()) continue; } catch { continue; }
      processBattleVariant(varDir, varName, subcategory);
    }
  }
}

console.log(`Battle animations: ${battleCount}`);

// ─── Map Sprites ─────────────────────────────────────────────────────────────

const MAP_DIR = join(FEGBA, 'Map Sprites');
let mapCount = 0;

// Both dash and underscore anim suffix conventions
const ANIM_SUFFIXES = [
  '-dance', '-stand-move', '-stand-stand', '-stand', '-walk', '-move',
  '_move', '_stand',
];

function stripAnimSuffix(name) {
  for (const suf of ANIM_SUFFIXES) {
    if (name.endsWith(suf)) return name.slice(0, name.length - suf.length);
  }
  return name;
}

/**
 * Parse sprite base name → { authors, name }
 * Supports: "Description {Author}" (FE-Repo convention, author at end)
 *       or: "{Author} Description" (legacy, author at start)
 */
function parseMapSpriteName(base) {
  // Author at end: "Class Name {Author1, Author2}"
  const mEnd = base.match(/^(.*?)\s*\{([^}]+)\}\s*$/);
  if (mEnd) {
    const authors = mEnd[2].split(',').map(a => a.trim());
    return { authors, name: mEnd[1].trim() };
  }
  // Legacy — no author braces at all
  return { authors: ['JaidynReiman'], name: base };
}

/**
 * Process PNGs in a dir, grouping by base name (strip anim suffix).
 * catFolderName is the actual on-disk folder name for preview paths.
 */
function processMapSpriteDir(dir, subcategory, catFolderName, subFolderName) {
  const groups = new Map();

  for (const f of listFiles(dir, '.png')) {
    const base = stripAnimSuffix(f.replace(/\.png$/i, ''));
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(f);
  }

  for (const [base, files] of groups) {
    const { authors, name } = parseMapSpriteName(base);
    const anims = files.map(f => {
      const noExt = f.replace(/\.png$/i, '');
      const suf = noExt.slice(base.length).replace(/^[-_]/, '');
      return suf || 'stand';
    });

    const id = `ms-${slugify(base)}`.replace(/-+/g, '-').slice(0, 80);

    // Prefer stand or stand-stand as preview
    const previewFile = files.find(f => f.includes('-stand-stand')) ||
                        files.find(f => f.includes('-stand.')) ||
                        files.find(f => f.endsWith('_stand.png')) ||
                        files[0] || '';

    // Build actual filesystem-relative preview path
    let previewPath = '';
    if (previewFile) {
      const parts = ['Map Sprites', catFolderName];
      if (subFolderName) parts.push(subFolderName);
      parts.push(previewFile);
      previewPath = parts.join('/');
    }

    writeJSON(join(DATA, subcategory, `${id}.json`), {
      id,
      name: name || base,
      category: 'fe',
      subcategory,
      type: 'spritesheet',
      license: 'F2U/F2E',
      credits: [{ authors }],
      animations: anims,
      preview: previewPath,
      download: '',
    });
    mapCount++;
  }
}

for (const catName of listDirs(MAP_DIR)) {
  if (catName.toLowerCase().endsWith('.md')) continue;

  const catDir = join(MAP_DIR, catName);
  const subcategory = `map-sprites/${categorySlug(catName)}`;

  // PNGs directly in the category dir
  processMapSpriteDir(catDir, subcategory, catName, '');

  // Named subdirs (Edits, Touchups, Templates, etc.) — but not [A] Previews
  for (const sub of listDirs(catDir)) {
    if (isAsepriteDir(sub)) continue;
    if (/preview/i.test(sub)) continue;
    const subDir = join(catDir, sub);
    processMapSpriteDir(subDir, subcategory, catName, sub);
  }
}

console.log(`Map sprites: ${mapCount}`);

// ─── Item Icons ──────────────────────────────────────────────────────────────

const ICONS_DIR = join(FEGBA, 'Icons');
let iconCount = 0;

function processIconDir(dir, subcategory, iconType) {
  const folderName = iconType === 'custom' ? 'Custom Sheets for LT' : 'Edited Sheets for LT';
  for (const f of listFiles(dir, '.png')) {
    const base = f.replace(/\.png$/i, '');
    // "{Authors} Description" format
    const m = base.match(/^\{([^}]+)\}\s+(.*)/);
    const authors = m ? m[1].split(',').map(a => a.trim()) : ['JaidynReiman'];
    const name = m ? m[2].trim() : base;

    const id = `icon-${slugify(base)}`.replace(/-+/g, '-').slice(0, 80);

    writeJSON(join(DATA, subcategory, `${id}.json`), {
      id,
      name,
      category: 'fe',
      subcategory,
      type: 'spritesheet',
      license: 'F2U/F2E',
      credits: [{ authors }],
      tags: [iconType],
      preview: `Icons/${folderName}/${f}`,
      download: '',
    });
    iconCount++;
  }
}

processIconDir(join(ICONS_DIR, 'Custom Sheets for LT'), 'item-icons', 'custom');
processIconDir(join(ICONS_DIR, 'Edited Sheets for LT'), 'item-icons', 'edited');

console.log(`Item icons: ${iconCount}`);

// ─── Summary ─────────────────────────────────────────────────────────────────

const total = portraitCount + battleCount + mapCount + iconCount;
console.log(`\nTotal FE assets generated: ${total}`);
