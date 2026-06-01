import fs from 'fs';
import path from 'path';
import { resolveAssetSpecs } from './AnimationService';
import { getAllAssets } from './AssetService';
import { collectLpcBodyTypes } from './lpcLayers';
import type { Asset } from './models/Asset';
import type {
  CommissionCategoryData,
  CommissionData,
  CommissionEntry,
  CommissionExampleInput,
  CommissionSectionData,
  ResolvedCommissionData,
  ResolvedCommissionExample,
} from './CommissionTypes';

const COMMISSION_DIR = path.join(process.cwd(), 'data', 'commissions');

function loadJSON(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function walkSection(sectionDir: string, sectionName: string): CommissionSectionData {
  const sectionMeta = loadJSON(path.join(sectionDir, 'meta.json'));
  const entries = fs.readdirSync(sectionDir)
    .filter(f => f.endsWith('.json') && f !== 'meta.json')
    .map(f => ({ id: path.basename(f, '.json'), ...loadJSON(path.join(sectionDir, f)) } as CommissionEntry))
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  return { key: sectionName, label: sectionMeta.label, description: sectionMeta.description, entries };
}

function walkCategory(categoryDir: string): CommissionCategoryData {
  const meta = loadJSON(path.join(categoryDir, 'meta.json'));
  const sectionDirs = fs.readdirSync(categoryDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => {
      const sectionMeta = loadJSON(path.join(categoryDir, e.name, 'meta.json'));
      return { name: e.name, priority: sectionMeta?.priority ?? 999 };
    })
    .sort((a, b) => a.priority - b.priority);

  const sections = sectionDirs.map(({ name }) => walkSection(path.join(categoryDir, name), name));
  return { key: path.basename(categoryDir), label: meta.label, description: meta.description, sections };
}

export function getCommissionData(): CommissionData {
  const meta = loadJSON(path.join(COMMISSION_DIR, 'meta.json'));
  const categories = ['lpc', 'fe', 'tilemaps'].map(key => walkCategory(path.join(COMMISSION_DIR, key)));
  return { meta, categories };
}

function normalizeExampleInput(input: CommissionExampleInput): { assetId: string; animation?: string; bodyType?: string; weapon?: string } | null {
  if (typeof input === 'string') {
    if (!input.trim()) return null;
    return { assetId: input.trim() };
  }

  if (!input.asset_id || !input.asset_id.trim()) return null;
  return {
    assetId: input.asset_id.trim(),
    animation: input.animation?.trim() || undefined,
    bodyType: input.body_type?.trim() || undefined,
    weapon: input.weapon?.trim() || undefined,
  };
}

function resolveLpcExample(asset: Asset, animation?: string, bodyType?: string): ResolvedCommissionExample {
  const resolved = resolveAssetSpecs(asset);

  if (!resolved || 'id' in resolved) {
    const fallback: ResolvedCommissionExample = { assetId: asset.id };
    if (animation) fallback.animation = animation;
    if (bodyType) fallback.bodyType = bodyType;
    return fallback;
  }

  const requestedAnim = animation && resolved[animation] ? animation : undefined;
  const fallbackAnim = requestedAnim || asset.animations?.find((name) => resolved[name]) || Object.keys(resolved)[0];
  const fallbackBodyType = bodyType || asset.body_types?.[0] || collectLpcBodyTypes(asset.layers)[0];
  const groupAnimNames = fallbackAnim && resolved[fallbackAnim]?.group?.length ? resolved[fallbackAnim].group : undefined;

  const payload: ResolvedCommissionExample = { assetId: asset.id };
  if (fallbackAnim) payload.animation = fallbackAnim;
  if (fallbackBodyType) payload.bodyType = fallbackBodyType;
  if (groupAnimNames && groupAnimNames.length > 0) payload.groupAnimNames = groupAnimNames;
  return payload;
}

function resolveFeExample(asset: Asset, weapon?: string): ResolvedCommissionExample {
  const payload: ResolvedCommissionExample = { assetId: asset.id };
  if (weapon) payload.weapon = weapon;
  return payload;
}

function resolveEntryExample(entry: CommissionEntry, assetsById: Map<string, Asset>): ResolvedCommissionExample | undefined {
  const firstExample = entry.examples?.[0];
  if (!firstExample) return undefined;

  const normalized = normalizeExampleInput(firstExample);
  if (!normalized) return undefined;

  const asset = assetsById.get(normalized.assetId);
  if (!asset) return undefined;

  if (asset.type === 'lpc') {
    return resolveLpcExample(asset, normalized.animation, normalized.bodyType);
  }

  if (asset.type === 'fe') {
    return resolveFeExample(asset, normalized.weapon);
  }

  return undefined;
}

export function getResolvedCommissionData(): ResolvedCommissionData {
  const data = getCommissionData();
  const allEntries = data.categories.flatMap(cat => cat.sections.flatMap(s => s.entries));
  const assetsById = new Map(getAllAssets().map((asset) => [asset.id, asset]));

  const examplesByEntryId: Record<string, ResolvedCommissionExample> = {};
  for (const entry of allEntries) {
    const resolved = resolveEntryExample(entry, assetsById);
    if (resolved) examplesByEntryId[entry.id] = resolved;
  }

  return {
    ...data,
    examplesByEntryId,
  };
}

export { formatPrice } from './commissionUtils';
