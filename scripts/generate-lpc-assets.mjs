import fs from 'fs';
import path from 'path';
import { mapLpcCredits } from './lib/lpcCreditsMapper.mjs';
import { resolveCompiledLayers } from './lib/lpcLayerResolver.mjs';
import {
  joinPosix,
  titleCaseFromSlug,
  toAssetDirectoryRelativePath,
  toOutputJsonRelativePath,
  topLevelCategoryFromRelativeDir,
} from './lib/lpcPathUtils.mjs';

const MODE_ADD_NEW = 'add-new';
const MODE_REBUILD = 'rebuild';
const MODE_CLEAR_NEW = 'clear-new';

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = path.join(PROJECT_ROOT, 'data', 'lpc');
const SOURCE_ROOT = process.env.LPC_SOURCE_ROOT
  ?? path.join(PROJECT_ROOT, '..', '..', 'assets', 'lpc', 'lpc-jaidynreiman-assets', 'characters');

const EXCLUDED_OUTPUT_FILES = new Set([
  // Removed from this site's catalog by request.
  'legs/pants/legs_pregnantpants.json',
  'legs/pants/legs_widepants.json',
  // Base head layers are used by animation composition and should not be standalone cards.
  'head/heads/human_male.json',
  'head/heads/human_female.json',
  'head/heads/human_child.json',
]);

const ROOT_META = {
  label: 'Liberated Pixel Cup Assets',
  description: '',
  priority: 2,
  accent: 'saturated',
};

const CATEGORY_CONFIG = {
  arms: { label: 'Arms', priority: 10, accent: 'saturated' },
  body: { label: 'Body', priority: 20, accent: 'saturated' },
  dress: { label: 'Dress', priority: 30, accent: 'saturated' },
  feet: { label: 'Feet', priority: 40, accent: 'saturated' },
  hair: { label: 'Hair', priority: 50, accent: 'saturated' },
  head: { label: 'Head', priority: 60, accent: 'saturated' },
  headwear: { label: 'Headwear', priority: 70, accent: 'saturated' },
  legs: { label: 'Legs', priority: 80, accent: 'saturated' },
  shoulders: { label: 'Shoulders', priority: 90, accent: 'saturated' },
  tools: { label: 'Tools', priority: 100, accent: 'saturated' },
  torso: { label: 'Torso', priority: 110, accent: 'saturated' },
  weapons: { label: 'Weapons', priority: 120, accent: 'saturated' },
  tilesets: { label: 'Tilesets', priority: 130, accent: 'saturated' },
};

function parseModeFromArgs() {
  if (process.argv.includes('--rebuild')) return MODE_REBUILD;
  if (process.argv.includes('--clear-new')) return MODE_CLEAR_NEW;

  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  if (!modeArg) return MODE_ADD_NEW;
  const value = modeArg.split('=')[1];
  if (value === MODE_ADD_NEW || value === MODE_REBUILD || value === MODE_CLEAR_NEW) {
    return value;
  }

  throw new Error(`Invalid mode: ${value}. Use --mode=add-new|rebuild|clear-new.`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function clearDataRootKeepMeta() {
  // WARNING: --rebuild deletes all subdirs, including any manually-edited subcategory
  // meta.json files. Back up custom meta.json edits before running --rebuild.
  ensureDir(DATA_ROOT);
  const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(DATA_ROOT, entry.name);
    if (entry.isFile() && entry.name === 'meta.json') continue;
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

function listJsonFilesRecursively(rootPath) {
  const output = [];

  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        output.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return output;
}

function listOutputAssetJsonFiles() {
  if (!fs.existsSync(DATA_ROOT)) return [];

  const files = [];
  function walk(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'meta.json') {
        files.push(fullPath);
      }
    }
  }

  walk(DATA_ROOT);
  return files;
}

function pruneUndefined(obj) {
  const output = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    output[key] = value;
  }
  return output;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function buildCompiledAsset(sourcePath) {
  const source = loadJson(sourcePath);
  const sourceRelativeDir = toAssetDirectoryRelativePath(SOURCE_ROOT, sourcePath);
  const relativeOutputPath = toOutputJsonRelativePath(SOURCE_ROOT, sourcePath);
  const outputPath = path.join(DATA_ROOT, relativeOutputPath);

  const topLevelCategory = topLevelCategoryFromRelativeDir(sourceRelativeDir);

  const layers = resolveCompiledLayers({
    sourceLayers: source.layers,
    sourceRelativeDir,
    charactersRoot: SOURCE_ROOT,
  });

  const credits = mapLpcCredits(source.credits);

  const compiled = pruneUndefined({
    name: source.name,
    type: 'lpc',
    category: topLevelCategory,
    format: 'spritesheet',
    animation_spec: 'lpc',
    license: credits.license,
    animations: source.animations,
    layers,
    credits: credits.credits,
    prerequisites: source.prerequisites,
    tags: source.tags,
    recolors: source.recolors,
    match_body_color: source.match_body_color,
    preview: '',
  });

  return {
    sourcePath,
    outputPath,
    relativeOutputPath,
    topLevelCategory,
    compiled,
  };
}

function applyNewFlagMode({ mode, compiled, existingOutput }) {
  if (mode === MODE_ADD_NEW) {
    return { ...compiled, new: true };
  }

  if (mode === MODE_REBUILD) {
    if (existingOutput?.new === true) {
      return { ...compiled, new: true };
    }
    return compiled;
  }

  return compiled;
}

function ensureRootMeta() {
  writeJson(path.join(DATA_ROOT, 'meta.json'), ROOT_META);
}

function writeCategoryMetaFromConfig(categorySet) {
  let categoryIndex = 1;
  const sorted = [...categorySet].sort((a, b) => a.localeCompare(b));

  for (const category of sorted) {
    const configured = CATEGORY_CONFIG[category] ?? {
      label: titleCaseFromSlug(category),
      priority: 200 + categoryIndex,
      accent: 'saturated',
    };

    categoryIndex += 1;

    const metaPath = path.join(DATA_ROOT, category, 'meta.json');
    writeJson(metaPath, {
      label: configured.label,
      description: '',
      priority: configured.priority,
      accent: configured.accent,
    });
  }
}

function writeLeafCategoryMeta(leafDirs) {
  for (const leafDir of leafDirs) {
    const metaPath = path.join(leafDir, 'meta.json');
    // Only create if it doesn't exist
    if (!fs.existsSync(metaPath)) {
      const dirName = path.basename(leafDir);
      writeJson(metaPath, {
        label: titleCaseFromSlug(dirName),
        description: '',
        priority: 500,
        accent: 'saturated',
      });
    }
  }
}

function deleteStaleOutputs(expectedRelativePaths) {
  const existingOutputFiles = listOutputAssetJsonFiles();
  let deletedCount = 0;

  for (const outputFile of existingOutputFiles) {
    const rel = outputFile.replace(`${DATA_ROOT}${path.sep}`, '').replace(/\\/g, '/');
    if (expectedRelativePaths.has(rel)) continue;
    fs.rmSync(outputFile, { force: true });
    deletedCount += 1;
  }

  return deletedCount;
}

function runClearNew() {
  const outputFiles = listOutputAssetJsonFiles();
  let cleared = 0;

  for (const filePath of outputFiles) {
    const data = loadJson(filePath);
    if (!Object.prototype.hasOwnProperty.call(data, 'new')) continue;
    delete data.new;
    writeJson(filePath, data);
    cleared += 1;
  }

  console.log(`LPC clear-new complete. Cleared ${cleared} asset files.`);
}

function runBuild(mode) {
  ensureDir(DATA_ROOT);
  if (mode === MODE_REBUILD) clearDataRootKeepMeta();
  ensureRootMeta();

  const sourceJsonFiles = listJsonFilesRecursively(SOURCE_ROOT);
  const expectedRelativePaths = new Set();
  const categories = new Set();
  const leafDirs = new Set();

  let written = 0;
  let skipped = 0;
  let excluded = 0;

  for (const sourcePath of sourceJsonFiles) {
    const compiled = buildCompiledAsset(sourcePath);
    const rel = compiled.relativeOutputPath;

    if (EXCLUDED_OUTPUT_FILES.has(rel)) {
      excluded += 1;
      continue;
    }

    expectedRelativePaths.add(rel);
    categories.add(compiled.topLevelCategory);
    
    // Track leaf directory (parent of asset file)
    leafDirs.add(path.dirname(compiled.outputPath));

    const outputExists = fs.existsSync(compiled.outputPath);
    const existingOutput = outputExists ? loadJson(compiled.outputPath) : null;

    if (mode === MODE_ADD_NEW && outputExists) {
      skipped += 1;
      continue;
    }

    const withMode = applyNewFlagMode({
      mode,
      compiled: compiled.compiled,
      existingOutput,
    });

    writeJson(compiled.outputPath, withMode);
    written += 1;
  }

  writeCategoryMetaFromConfig(categories);
  writeLeafCategoryMeta(leafDirs);

  let deleted = 0;
  if (mode === MODE_REBUILD) {
    deleted = deleteStaleOutputs(expectedRelativePaths);
  }

  console.log(`LPC generation complete (${mode}).`);
  console.log(`- Source assets scanned: ${sourceJsonFiles.length}`);
  console.log(`- Source assets excluded: ${excluded}`);
  console.log(`- Assets written: ${written}`);
  if (mode === MODE_ADD_NEW) console.log(`- Existing assets skipped: ${skipped}`);
  if (mode === MODE_REBUILD) console.log(`- Stale output assets deleted: ${deleted}`);
  console.log(`- Categories meta written: ${categories.size}`);
  console.log(`- Leaf categories meta written: ${leafDirs.size}`);
}

function main() {
  const mode = parseModeFromArgs();

  if (mode === MODE_CLEAR_NEW) {
    runClearNew();
    return;
  }

  if (!fs.existsSync(SOURCE_ROOT)) {
    throw new Error(`Missing LPC source root: ${SOURCE_ROOT}`);
  }

  runBuild(mode);
}

main();
