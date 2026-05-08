import fs from 'fs';
import path from 'path';
import type { Asset } from './models/Asset';

const DATA_ROOT = path.join(process.cwd(), 'data');
const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const LPC_PUBLIC_BASE = 'assets/lpc';
const LPC_CHARACTERS_ROOT = path.join(PUBLIC_ROOT, LPC_PUBLIC_BASE, 'characters');

const HTTP_URL_PATTERN = /^https?:\/\//i;

function normalizeAssetPath(value?: string): string {
  if (!value) return '';
  if (HTTP_URL_PATTERN.test(value)) return value;
  return value.replace(/^\/+/, '');
}

function resolveLpcPath(value?: string): string {
  const normalized = normalizeAssetPath(value);
  if (!normalized || HTTP_URL_PATTERN.test(normalized)) return normalized;
  if (normalized.startsWith(`${LPC_PUBLIC_BASE}/`)) return normalized;
  if (normalized.startsWith('characters/')) return `${LPC_PUBLIC_BASE}/${normalized}`;
  return `${LPC_PUBLIC_BASE}/characters/${normalized}`;
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

  for (const layer of asset.layers ?? []) {
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

function loadAsset(filePath: string): Asset {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const asset: Asset = { ...data, id: path.basename(filePath, '.json') };
  return normalizeAsset(asset);
}

function readAssetsFromDir(dirPath: string): Asset[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(isAssetFile)
    .map((f) => loadAsset(path.join(dirPath, f)));
}

export function getAssetsByCategory(categoryPath: string): Asset[] {
  const dirPath = path.join(DATA_ROOT, categoryPath);
  return readAssetsFromDir(dirPath);
}

export function getAllAssets(): Asset[] {
  const results: Asset[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (isAssetFile(entry.name)) {
        results.push(loadAsset(fullPath));
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
