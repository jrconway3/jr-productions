import fs from 'fs';
import path from 'path';
import type { Asset } from './models/Asset';
import type { BackgroundLayer, PageCreditEntry, ResolvedPageCredit } from './models/Category';
import { expandLpcLayers } from './lpcLayers';
import { hasPrerequisites } from './assetSampling';

const DATA_ROOT = path.join(process.cwd(), 'data');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const LPC_PUBLIC_BASE = 'assets/lpc';
const FE_PUBLIC_BASE = 'assets/fe';
const LPC_CHARACTERS_ROOT = path.join(PUBLIC_ROOT, LPC_PUBLIC_BASE, 'characters');
const LPC_ANIMATIONS_ROOT = path.join(DATA_ROOT, 'animations', 'lpc');

const lpcGlobalLayerAssetIdsByAnimation = new Map<string, string[]>();

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

function collectLpcGlobalLayerAssetIds(ref: unknown, collector: Set<string>): void {
  if (typeof ref === 'string') {
    const normalized = ref.replace(/\\/g, '/').replace(/^\/+/, '');
    const id = path.basename(normalized, '.json');
    if (id) collector.add(id);
    return;
  }

  if (!ref || typeof ref !== 'object') return;
  const rawRef = ref as Record<string, unknown>;
  const assetRef = rawRef.asset;

  if (typeof assetRef === 'string') {
    collector.add(assetRef);
    return;
  }

  if (!Array.isArray(assetRef)) return;
  for (const conditionalRef of assetRef) {
    if (!conditionalRef || typeof conditionalRef !== 'object') continue;
    const conditionalAssetRef = (conditionalRef as Record<string, unknown>).asset;
    if (typeof conditionalAssetRef === 'string') collector.add(conditionalAssetRef);
  }
}

function getLpcGlobalLayerAssetIdsForAnimation(animationName: string): string[] {
  const cached = lpcGlobalLayerAssetIdsByAnimation.get(animationName);
  if (cached) return cached;

  const specPath = path.join(LPC_ANIMATIONS_ROOT, `${animationName}.json`);
  if (!fs.existsSync(specPath)) {
    lpcGlobalLayerAssetIdsByAnimation.set(animationName, []);
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(specPath, 'utf-8')) as { global_layers?: unknown[] };
    const collected = new Set<string>();
    for (const ref of parsed.global_layers ?? []) {
      collectLpcGlobalLayerAssetIds(ref, collected);
    }

    const ids = [...collected];
    lpcGlobalLayerAssetIdsByAnimation.set(animationName, ids);
    return ids;
  } catch {
    lpcGlobalLayerAssetIdsByAnimation.set(animationName, []);
    return [];
  }
}

function buildLpcGlobalLayerCredits(sectionPath: string, existingLabels: Set<string>): ResolvedPageCredit[] {
  const sectionAssets = getAssetsByCategoryTree(sectionPath).filter((asset) => asset.type === 'lpc');
  if (sectionAssets.length === 0) return [];

  const neededIds = new Set<string>();
  for (const asset of sectionAssets) {
    for (const animationName of asset.animations ?? []) {
      const globalLayerAssetIds = getLpcGlobalLayerAssetIdsForAnimation(animationName);
      for (const assetId of globalLayerAssetIds) neededIds.add(assetId);
    }
  }

  const assetMap = findAssetsByIds(neededIds);
  const autoCredits: ResolvedPageCredit[] = [];
  const sortedAssets = [...assetMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  for (const asset of sortedAssets) {
    const label = asset.name?.trim();
    if (!label) continue;

    const normalizedLabel = label.toLowerCase();
    if (existingLabels.has(normalizedLabel)) continue;

    const authors = new Set<string>();
    const urls = new Set<string>();
    const notes = new Set<string>();

    for (const credit of asset.credits ?? []) {
      for (const author of credit.authors ?? []) authors.add(author);
      for (const url of credit.urls ?? []) urls.add(url);
      if (credit.notes) notes.add(credit.notes);
    }

    const resolvedCredit: ResolvedPageCredit = {
      label,
      authors: [...authors],
      urls: [...urls],
    };

    if (asset.license) resolvedCredit.license = asset.license;
    if (notes.size > 0) resolvedCredit.notes = [...notes].join(' | ');

    const hasMetadata = resolvedCredit.authors.length > 0
      || resolvedCredit.urls.length > 0
      || Boolean(resolvedCredit.license)
      || Boolean(resolvedCredit.notes);
    if (!hasMetadata) continue;

    existingLabels.add(normalizedLabel);
    autoCredits.push(resolvedCredit);
  }

  return autoCredits;
}

export function getSectionPageCredits(sectionPath: string): ResolvedPageCredit[] {
  // Walk up the path hierarchy to find the nearest meta.json with page_credits.
  const parts = sectionPath.split('/').filter(Boolean);
  let meta = null;
  for (let i = parts.length; i >= 1; i--) {
    const tryPath = parts.slice(0, i).join('/');
    meta = readDirMeta(path.join(DATA_ROOT, tryPath));
    if (meta?.page_credits?.length) break;
    meta = null;
  }
  const resolvedMetaCredits: ResolvedPageCredit[] = [];
  if (meta?.page_credits?.length) {
    const neededIds = new Set<string>(meta.page_credits.flatMap((e) => e.asset_ids ?? []));
    const assetMap = findAssetsByIds(neededIds);

    for (const entry of meta.page_credits) {
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
      resolvedMetaCredits.push(credit);
    }
  }

  if (!sectionPath.startsWith('lpc')) return resolvedMetaCredits;

  const existingLabels = new Set<string>(
    resolvedMetaCredits.map((credit) => credit.label.toLowerCase()),
  );

  const autoLayerCredits = buildLpcGlobalLayerCredits(sectionPath, existingLabels);
  return [...resolvedMetaCredits, ...autoLayerCredits];
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
        if (!asset.excluded && !hasPrerequisites(asset)) {
          results.push(asset);
        }
      }
    }
  }

  walk(DATA_ROOT);
  return results;
}
