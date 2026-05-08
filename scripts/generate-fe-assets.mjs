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
  { sourceRoot: 'Portraits', dataRoot: 'portraits', label: 'Portraits', priority: 10, scanner: scanPortraits },
  { sourceRoot: 'battle_animations', dataRoot: 'battle-animations', label: 'Battle Animations', priority: 20, scanner: scanBattleAnimations },
  { sourceRoot: 'map_sprites', dataRoot: 'map-sprites', label: 'Map Sprites', priority: 30, scanner: scanMapSprites },
  { sourceRoot: 'autotiles', dataRoot: 'autotiles', label: 'Autotiles', priority: 40, scanner: scanAutotiles },
  { sourceRoot: 'Icons', dataRoot: 'icons', label: 'Icons', priority: 50, scanner: scanIcons },
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

  for (const assetEntry of assets) {
    const relativeDir = normalizeSlashes(assetEntry.relativeDir);
    const targetDir = path.join(FE_DATA_ROOT, relativeDir);
    ensureDir(targetDir);

    if (!usedPerDirectory.has(relativeDir)) usedPerDirectory.set(relativeDir, new Set());
    const usedSlugs = usedPerDirectory.get(relativeDir);

    const uniqueSlug = ensureUniqueSlug(assetEntry.fileSlug, usedSlugs);
    const targetPath = path.join(targetDir, `${uniqueSlug}.json`);

    if (writeJsonFile(targetPath, assetEntry.data, { overwrite })) written += 1;
  }

  return written;
}

function generateCategory(config, overwrite) {
  const sourcePath = path.join(FE_SOURCE_ROOT, config.sourceRoot);
  if (!fs.existsSync(sourcePath)) {
    return { category: config.dataRoot, assetCount: 0, metaCount: 0 };
  }

  writeCategoryMeta(config, overwrite);

  const scanResult = config.scanner(sourcePath, PUBLIC_ROOT);
  const metaCount = writeGeneratedMetas(scanResult.metas, overwrite);
  const assetCount = writeGeneratedAssets(scanResult.assets, overwrite);

  return { category: config.dataRoot, assetCount, metaCount };
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

  console.log(`FE generation complete (${mode}).`);
  for (const result of results) {
    const label = titleCaseFromSlug(mapSourceRootToDataRoot(result.category));
    console.log(`- ${label}: ${result.assetCount} assets, ${result.metaCount} metas`);
  }
  console.log(`Total: ${totalAssets} assets, ${totalMetas} metas.`);
}

run();
