import fs from 'fs';
import path from 'path';
import type { Asset } from './models/Asset';

const DATA_ROOT = path.join(process.cwd(), 'data');

function isAssetFile(filename: string): boolean {
  return filename.endsWith('.json') && filename !== 'meta.json';
}

function readAssetsFromDir(dirPath: string): Asset[] {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter(isAssetFile);
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8')) as Asset);
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
        results.push(JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Asset);
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
