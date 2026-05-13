import fs from 'fs';
import path from 'path';
import type { Asset } from './models/Asset';
import type { BackgroundLayer, PageCreditEntry, ResolvedPageCredit } from './models/Category';
import { expandLpcLayers } from './lpcLayers';

const DATA_ROOT = path.join(process.cwd(), 'data');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const LPC_PUBLIC_BASE = 'assets/lpc';
const FE_PUBLIC_BASE = 'assets/fe';
const LPC_CHARACTERS_ROOT = path.join(PUBLIC_ROOT, LPC_PUBLIC_BASE, 'characters');

const HTTP_URL_PATTERN = /^https?:\/\//i;

function normalizeAssetPath(value?: string): string {
  if (!value) return '';
  if (HTTP_URL_PATTERN.test(value)) return value;
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function resolveLpcPath(value?: string): string {
  const normalized = normalizeAssetPath(value);
  if (!normalized || HTTP_URL_PATTERN.test(normalized)) return normalized;
  if (normalized.startsWith(`${LPC_PUBLIC_BASE}/`)) return normalized;
  if (normalized.startsWith('characters/')) return `${LPC_PUBLIC_BASE}/${normalized}`;
  return `${LPC_PUBLIC_BASE}/characters/${normalized}`;
}

function resolveFePath(value?: string): string {
  const normalized = normalizeAssetPath(value);
  if (!normalized || HTTP_URL_PATTERN.test(normalized)) return normalized;
  if (normalized.startsWith(`${FE_PUBLIC_BASE}/`)) return normalized;
  return `${FE_PUBLIC_BASE}/${normalized}`;
}

function deriveLpcPreview(asset: Asset): string {
  const preferredAnimations = [
    'walk',
    'idle',
    'run',
    ...(asset.animations ?? []),
  ];

  const seen = new Set<string>();
  const uniqueAnimations = preferredAnimations.filter((name) => {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  for (const layer of expandLpcLayers(asset.layers)) {
    const layerDir = path.join(LPC_CHARACTERS_ROOT, layer.path);
    if (!fs.existsSync(layerDir)) continue;

    for (const animation of uniqueAnimations) {
      const filename = `${animation}.png`;
      if (fs.existsSync(path.join(layerDir, filename))) {
        return resolveLpcPath(path.posix.join(layer.path.replace(/\\/g, '/'), filename));
      }
    }

    const firstPng = fs.readdirSync(layerDir).find((entry) => entry.endsWith('.png'));
    if (firstPng) {
      return resolveLpcPath(path.posix.join(layer.path.replace(/\\/g, '/'), firstPng));
    }
  }

  return '';
}

function normalizeAsset(asset: Asset): Asset {
  if (asset.type === 'fe') {
    return {
      ...asset,
      preview: resolveFePath(asset.preview),
      download: resolveFePath(asset.download),
    };
  }

  if (asset.type !== 'lpc') {
    return {
      ...asset,
      preview: normalizeAssetPath(asset.preview),
      download: normalizeAssetPath(asset.download),
    };
  }

  const normalizedPreview = resolveLpcPath(asset.preview) || deriveLpcPreview(asset);
  return {
    ...asset,
    preview: normalizedPreview,
    download: normalizeAssetPath(asset.download),
  };
}

function isAssetFile(filename: string): boolean {
  return filename.endsWith('.json') && filename !== 'meta.json';
}

type DirMeta = { excluded?: boolean; featured?: boolean; layers?: BackgroundLayer[]; page_credits?: PageCreditEntry[] };

function readDirMeta(dirPath: string): DirMeta | null {
  const metaPath = path.join(dirPath, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as DirMeta;
  } catch { return null; }
}

function isDirExcluded(dirPath: string): boolean {
  return readDirMeta(dirPath)?.excluded === true;
}

function readDirLayers(dirPath: string): BackgroundLayer[] | null {
  return readDirMeta(dirPath)?.layers ?? null;
}

function inheritContextLayers(filePath: string): BackgroundLayer[] | undefined {
  let dir = path.dirname(filePath);
  while (dir.startsWith(DATA_ROOT) && dir !== DATA_ROOT) {
    const layers = readDirLayers(dir);
    if (layers) return layers;
    dir = path.dirname(dir);
  }
  return undefined;
}

function loadAsset(filePath: string): Asset {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const asset: Asset = { ...data, id: path.basename(filePath, '.json') };
  if (!asset.context_layers) {
    const inherited = inheritContextLayers(filePath);
    if (inherited) asset.context_layers = inherited;
  }
  return normalizeAsset(asset);
}

function hasPrerequisites(asset: Asset): boolean {
  const prerequisites = asset.prerequisites;
  if (!prerequisites) return false;
  return (prerequisites.asset?.length ?? 0) > 0 || (prerequisites.category?.length ?? 0) > 0;
}

function readAssetsFromDir(dirPath: string): Asset[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(isAssetFile)
    .map((f) => loadAsset(path.join(dirPath, f)))
    .filter((a) => !a.excluded);
}

export function getAssetsByCategory(categoryPath: string): Asset[] {
  const dirPath = path.join(DATA_ROOT, categoryPath);
  return readAssetsFromDir(dirPath);
}

export function getAssetsByCategoryTree(categoryPath: string): Asset[] {
  const rootPath = path.join(DATA_ROOT, categoryPath);
  if (!fs.existsSync(rootPath)) return [];

  const results: Asset[] = [];

  function walk(dirPath: string) {
    if (isDirExcluded(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isAssetFile(entry.name)) {
        const asset = loadAsset(fullPath);
        if (!asset.excluded) results.push(asset);
      }
    }
  }

  walk(rootPath);
  return results;
}

export function getAllAssets(): Asset[] {
  const results: Asset[] = [];

  function walk(dir: string) {
    if (isDirExcluded(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isAssetFile(entry.name)) {
        const asset = loadAsset(fullPath);
        if (!asset.excluded) results.push(asset);
      }
    }
  }

  walk(DATA_ROOT);
  return results;
}

export function getAssetById(id: string): Asset | null {
  const all = getAllAssets();
  return all.find((a) => a.id === id) ?? null;
}

function findAssetsByIds(ids: Set<string>): Map<string, Asset> {
  const result = new Map<string, Asset>();
  function walk(dir: string) {
    if (result.size === ids.size) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isAssetFile(entry.name)) {
        const id = path.basename(fullPath, '.json');
        if (ids.has(id)) result.set(id, loadAsset(fullPath));
      }
    }
  }
  if (ids.size > 0) walk(DATA_ROOT);
  return result;
}

export function getSectionPageCredits(sectionPath: string): ResolvedPageCredit[] {
  const dirPath = path.join(DATA_ROOT, sectionPath);
  const meta = readDirMeta(dirPath);
  if (!meta?.page_credits?.length) return [];

  const neededIds = new Set<string>(meta.page_credits.flatMap((e) => e.asset_ids ?? []));
  const assetMap = findAssetsByIds(neededIds);

  return meta.page_credits.map((entry) => {
    const authors = new Set<string>(entry.authors ?? []);
    const urls = new Set<string>(entry.urls ?? []);
    const licenses = new Set<string>();

    for (const assetId of entry.asset_ids ?? []) {
      const asset = assetMap.get(assetId);
      if (asset?.credits) {
        for (const c of asset.credits) {
          for (const author of c.authors) authors.add(author);
          for (const url of c.urls ?? []) urls.add(url);
        }
      }
      if (asset?.license) licenses.add(asset.license);
    }

    const credit: ResolvedPageCredit = { label: entry.label, authors: [...authors], urls: [...urls] };
    const resolvedLicense = entry.license ?? (licenses.size > 0 ? [...licenses].join(', ') : undefined);
    if (resolvedLicense != null) credit.license = resolvedLicense;
    if (entry.notes != null) credit.notes = entry.notes;
    return credit;
  });
}

export function getHomepageFeaturedAssets(): Asset[] {
  const results: Asset[] = [];

  function walk(dir: string) {
    const meta = readDirMeta(dir);
    if (meta?.excluded === true || meta?.featured === false) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isAssetFile(entry.name)) {
        const asset = loadAsset(fullPath);
        if (!hasPrerequisites(asset)) {
          results.push(asset);
        }
      }
    }
  }

  walk(DATA_ROOT);
  return results;
}
