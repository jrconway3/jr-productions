import fs from 'fs';
import path from 'path';
import {
  mapSourceRootToDataRoot,
  titleCaseFromSlug,
  ensureUniqueSlug,
  normalizeSlashes,
} from './lib/fePathUtils.mjs';
import {
  scanAutotiles,
  scanBattleAnimations,
  scanIcons,
  scanMapSprites,
  scanMaps,
  scanPortraits,
} from './lib/feWalker.mjs';

const MODE_ADD_NEW = 'add-new';
const MODE_REBUILD = 'rebuild';

const PROJECT_ROOT = process.cwd();
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const FE_SOURCE_ROOT = path.join(PUBLIC_ROOT, 'assets', 'fe');
const FE_DATA_ROOT = path.join(PROJECT_ROOT, 'data', 'fe');

const CATEGORY_CONFIG = [
  { sourceRoot: 'portraits', dataRoot: 'portraits', label: 'Portraits', priority: 10, scanner: scanPortraits },
  { sourceRoot: 'battle_animations', dataRoot: 'battle-animations', label: 'Battle Animations', priority: 20, scanner: scanBattleAnimations },
  { sourceRoot: 'map_sprites', dataRoot: 'map-sprites', label: 'Map Sprites', priority: 30, scanner: scanMapSprites },
  { sourceRoot: 'autotiles', dataRoot: 'autotiles', label: 'Autotiles', priority: 40, scanner: scanAutotiles },
  { sourceRoot: 'icons', dataRoot: 'icons', label: 'Icons', priority: 50, scanner: scanIcons },
  { sourceRoot: 'maps', dataRoot: 'maps', label: 'Maps', priority: 60, scanner: scanMaps },
];

function parseModeFromArgs() {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!modeArg) return MODE_ADD_NEW;
  const mode = modeArg.split('=')[1];
  if (mode === MODE_ADD_NEW || mode === MODE_REBUILD) return mode;
  throw new Error(`Invalid mode: ${mode}. Use --mode=add-new or --mode=rebuild`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, data, { overwrite }) {
  if (!overwrite && fs.existsSync(filePath)) return false;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return true;
}

function removeDataChildrenKeepRootMeta() {
  ensureDir(FE_DATA_ROOT);
  const entries = fs.readdirSync(FE_DATA_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(FE_DATA_ROOT, entry.name);
    if (entry.isFile() && entry.name === 'meta.json') continue;
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function ensureRootMeta() {
  const rootMetaPath = path.join(FE_DATA_ROOT, 'meta.json');
  if (fs.existsSync(rootMetaPath)) return;

  writeJsonFile(rootMetaPath, {
    label: 'Fire Emblem GBA Assets',
    description: '',
    priority: 1,
    accent: 'warm',
  }, { overwrite: true });
}

function writeCategoryMeta(config, overwrite) {
  const categoryMetaPath = path.join(FE_DATA_ROOT, config.dataRoot, 'meta.json');
  const categoryMeta = {
    label: config.label,
    description: '',
    priority: config.priority,
    accent: 'warm',
  };

  return writeJsonFile(categoryMetaPath, categoryMeta, { overwrite });
}

function writeGeneratedMetas(metas, overwrite) {
  let written = 0;
  for (const metaEntry of metas) {
    const relativeDir = normalizeSlashes(metaEntry.relativeDir);
    const targetMetaPath = path.join(FE_DATA_ROOT, relativeDir, 'meta.json');
    if (writeJsonFile(targetMetaPath, metaEntry.meta, { overwrite })) written += 1;
  }
  return written;
}

function writeGeneratedAssets(assets, overwrite) {
  let written = 0;
  const usedPerDirectory = new Map();
  const writtenPaths = new Set();

  for (const assetEntry of assets) {
    const relativeDir = normalizeSlashes(assetEntry.relativeDir);
    const targetDir = path.join(FE_DATA_ROOT, relativeDir);
    ensureDir(targetDir);

    if (!usedPerDirectory.has(relativeDir)) usedPerDirectory.set(relativeDir, new Set());
    const usedSlugs = usedPerDirectory.get(relativeDir);

    const uniqueSlug = ensureUniqueSlug(assetEntry.fileSlug, usedSlugs);
    const targetPath = path.join(targetDir, `${uniqueSlug}.json`);

    writtenPaths.add(targetPath);
    if (writeJsonFile(targetPath, assetEntry.data, { overwrite })) written += 1;
  }

  return { written, writtenPaths };
}

function deleteStaleAssets(categoryDataRoot, expectedPaths) {
  const existingFiles = [];

  function walk(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'meta.json') {
        existingFiles.push(full);
      }
    }
  }

  walk(categoryDataRoot);

  let deleted = 0;
  for (const file of existingFiles) {
    if (!expectedPaths.has(file)) {
      fs.rmSync(file, { force: true });
      deleted += 1;
    }
  }
  return deleted;
}

function collectMissingCredits(assets) {
  return assets
    .filter((entry) => !Array.isArray(entry.data?.credits) || entry.data.credits.length === 0)
    .map((entry) => `${normalizeSlashes(entry.relativeDir)}/${entry.fileSlug}`);
}

function generateCategory(config, overwrite) {
  const sourcePath = path.join(FE_SOURCE_ROOT, config.sourceRoot);
  if (!fs.existsSync(sourcePath)) {
    return { category: config.dataRoot, assetCount: 0, metaCount: 0, deletedCount: 0, missingCredits: [] };
  }

  const scanResult = config.scanner(sourcePath, PUBLIC_ROOT);

  if (scanResult.assets.length === 0) {
    return { category: config.dataRoot, assetCount: 0, metaCount: 0, deletedCount: 0, missingCredits: [] };
  }

  writeCategoryMeta(config, overwrite);

  const metaCount = writeGeneratedMetas(scanResult.metas, overwrite);
  const { written: assetCount, writtenPaths } = writeGeneratedAssets(scanResult.assets, overwrite);
  const missingCredits = collectMissingCredits(scanResult.assets);

  // In rebuild mode removeDataChildrenKeepRootMeta() already cleared everything;
  // stale deletion is only needed in add-new mode.
  const deletedCount = overwrite ? 0 : deleteStaleAssets(path.join(FE_DATA_ROOT, config.dataRoot), writtenPaths);

  return { category: config.dataRoot, assetCount, metaCount, deletedCount, missingCredits };
}

function run() {
  const mode = parseModeFromArgs();
  const overwrite = mode === MODE_REBUILD;

  if (!fs.existsSync(FE_SOURCE_ROOT)) {
    throw new Error(`Missing FE source root: ${FE_SOURCE_ROOT}`);
  }

  ensureRootMeta();
  if (mode === MODE_REBUILD) removeDataChildrenKeepRootMeta();

  const results = CATEGORY_CONFIG.map((config) => generateCategory(config, overwrite));

  const totalAssets = results.reduce((sum, item) => sum + item.assetCount, 0);
  const totalMetas = results.reduce((sum, item) => sum + item.metaCount, 0);
  const totalDeleted = results.reduce((sum, item) => sum + item.deletedCount, 0);
  const totalMissingCredits = results.reduce((sum, item) => sum + item.missingCredits.length, 0);

  console.log(`FE generation complete (${mode}).`);
  for (const result of results) {
    const label = titleCaseFromSlug(mapSourceRootToDataRoot(result.category));
    console.log(`- ${label}: ${result.assetCount} assets, ${result.metaCount} metas, ${result.deletedCount} stale deleted`);

    if (result.missingCredits.length > 0) {
      console.warn(`  ! Missing credits (${result.missingCredits.length})`);
      for (const item of result.missingCredits.slice(0, 8)) {
        console.warn(`    - ${item}`);
      }
      if (result.missingCredits.length > 8) {
        console.warn(`    - ...and ${result.missingCredits.length - 8} more`);
      }
    }
  }
  console.log(`Total: ${totalAssets} assets, ${totalMetas} metas, ${totalDeleted} stale deleted.`);
  if (totalMissingCredits > 0) {
    console.warn(`Missing credits summary: ${totalMissingCredits} asset imports still need credits metadata.`);
  }
}

run();
