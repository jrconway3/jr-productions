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
  if (normalized.startsWith('characters/') || normalized.startsWith('tilesets/') || normalized.startsWith('tilemaps/')) return `${LPC_PUBLIC_BASE}/${normalized}`;
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
      download: typeof asset.download === 'string' ? resolveFePath(asset.download) : asset.download,
    };
  }

  if (asset.type !== 'lpc') {
    return {
      ...asset,
      preview: normalizeAssetPath(asset.preview),
      download: typeof asset.download === 'string' ? normalizeAssetPath(asset.download) : asset.download,
    };
  }

  const normalizedPreview = resolveLpcPath(asset.preview) || deriveLpcPreview(asset);
  const normalizedDownload = Array.isArray(asset.download)
    ? asset.download.map(resolveLpcPath)
    : normalizeAssetPath(asset.download);
  return {
    ...asset,
    preview: normalizedPreview,
    download: normalizedDownload,
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

function resolvePublicRelativePath(value: string, publicDir: string): string {
  if (!value || HTTP_URL_PATTERN.test(value) || value.startsWith('/') || value.startsWith('assets/')) return value;
  return path.posix.join(publicDir, value);
}

function loadAsset(filePath: string): Asset {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const asset: Asset = { ...data, id: path.basename(filePath, '.json') };

  const relToPublic = path.relative(PUBLIC_ROOT, filePath);
  if (!relToPublic.startsWith('..')) {
    const publicDir = path.relative(PUBLIC_ROOT, path.dirname(filePath)).replace(/\\/g, '/');
    if (typeof asset.preview === 'string') asset.preview = resolvePublicRelativePath(asset.preview, publicDir);
    if (Array.isArray(asset.download)) {
      asset.download = asset.download.map((d) => resolvePublicRelativePath(d, publicDir));
    } else if (typeof asset.download === 'string') {
      asset.download = resolvePublicRelativePath(asset.download, publicDir);
    }
  }

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

function getLpcGlobalLayerCreditBucket(asset: Asset): { key: string; label: string } {
  if (asset.category === 'head') {
    return { key: 'lpc:head', label: 'Head' };
  }

  if (asset.category === 'body' || asset.id === 'body') {
    return { key: 'lpc:body', label: 'Body' };
  }

  const fallbackLabel = asset.name?.trim() || asset.id;
  return { key: `lpc:asset:${asset.id}`, label: fallbackLabel };
}

function buildLpcGlobalLayerCredits(
  sectionPath: string,
  existingLabels: Set<string>,
  sectionAssets?: Asset[],
): ResolvedPageCredit[] {
  const sourceAssets = sectionAssets ?? getAssetsByCategoryTree(sectionPath);
  const lpcSectionAssets = sourceAssets.filter((asset) => asset.type === 'lpc');
  if (lpcSectionAssets.length === 0) return [];

  const neededIds = new Set<string>();
  for (const asset of lpcSectionAssets) {
    for (const animationName of asset.animations ?? []) {
      const globalLayerAssetIds = getLpcGlobalLayerAssetIdsForAnimation(animationName);
      for (const assetId of globalLayerAssetIds) neededIds.add(assetId);
    }
  }

  const assetMap = findAssetsByIds(neededIds);
  const grouped = new Map<string, {
    label: string;
    authors: Set<string>;
    urls: Set<string>;
    licenses: Set<string>;
    notes: Set<string>;
  }>();

  const sortedAssets = [...assetMap.values()].sort((a, b) => {
    const aName = a.name?.trim() || a.id;
    const bName = b.name?.trim() || b.id;
    return aName.localeCompare(bName);
  });

  for (const asset of sortedAssets) {
    const { key, label } = getLpcGlobalLayerCreditBucket(asset);
    const normalizedLabel = label.toLowerCase();
    if (existingLabels.has(normalizedLabel)) continue;

    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = {
        label,
        authors: new Set<string>(),
        urls: new Set<string>(),
        licenses: new Set<string>(),
        notes: new Set<string>(),
      };
      grouped.set(key, bucket);
    }

    if (asset.license) bucket.licenses.add(asset.license);
    for (const credit of asset.credits ?? []) {
      for (const author of credit.authors ?? []) bucket.authors.add(author);
      for (const url of credit.urls ?? []) bucket.urls.add(url);
      if (credit.notes) bucket.notes.add(credit.notes);
    }
  }

  const autoCredits: ResolvedPageCredit[] = [];
  const orderedBuckets = [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const bucket of orderedBuckets) {
    const resolvedCredit: ResolvedPageCredit = {
      label: bucket.label,
      authors: [...bucket.authors],
      urls: [...bucket.urls],
    };

    if (bucket.licenses.size > 0) resolvedCredit.license = [...bucket.licenses].join(', ');
    if (bucket.notes.size > 0) resolvedCredit.notes = [...bucket.notes].join(' | ');

    const hasMetadata = resolvedCredit.authors.length > 0
      || resolvedCredit.urls.length > 0
      || Boolean(resolvedCredit.license)
      || Boolean(resolvedCredit.notes);
    if (!hasMetadata) continue;

    existingLabels.add(bucket.label.toLowerCase());
    autoCredits.push(resolvedCredit);
  }

  return autoCredits;
}

export function getSectionPageCredits(sectionPath: string, sectionAssets?: Asset[]): ResolvedPageCredit[] {
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

  const autoLayerCredits = buildLpcGlobalLayerCredits(sectionPath, existingLabels, sectionAssets);
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
