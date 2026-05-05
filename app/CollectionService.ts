import fs from 'fs';
import path from 'path';
import type { Collection } from './models/Collection';
import { getAssetById } from './AssetService';
import type { Asset } from './models/Asset';

const COLLECTIONS_PATH = path.join(process.cwd(), 'data', 'collections.json');

export function getAllCollections(): Collection[] {
  if (!fs.existsSync(COLLECTIONS_PATH)) return [];
  return JSON.parse(fs.readFileSync(COLLECTIONS_PATH, 'utf-8')) as Collection[];
}

export function getCollectionById(id: string): Collection | null {
  return getAllCollections().find((c) => c.id === id) ?? null;
}

export function getCollectionAssets(id: string): Asset[] {
  const collection = getCollectionById(id);
  if (!collection) return [];
  return collection.assets.map((assetId) => getAssetById(assetId)).filter((a): a is Asset => a !== null);
}
