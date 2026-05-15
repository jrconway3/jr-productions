import fs from 'fs';
import path from 'path';
import { resolveAssetSpecs } from './AnimationService';
import { getAllAssets } from './AssetService';
import { collectLpcBodyTypes } from './lpcLayers';
import type { Asset } from './models/Asset';
import type {
  CommissionData,
  CommissionEntry,
  CommissionExampleInput,
  ResolvedCommissionData,
  ResolvedCommissionExample,
} from './CommissionTypes';

const COMMISSION_DIR = path.join(process.cwd(), 'data', 'commissions');

function loadJSON(filename: string) {
  const filePath = path.join(COMMISSION_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function getCommissionData(): CommissionData {
  const meta = loadJSON('meta.json');
  const lpcEntries: CommissionEntry[] = loadJSON('lpc.json');
  const feEntries: CommissionEntry[] = loadJSON('fe.json');

  // Separate base assets from add-ons
  const lpc_base = lpcEntries.filter((e) => !e.addon);
  const lpc_addons = lpcEntries.filter((e) => e.addon);
  const fe_base = feEntries.filter((e) => !e.addon);
  const fe_addons = feEntries.filter((e) => e.addon);

  return {
    meta,
    lpc_base,
    lpc_addons,
    fe_base,
    fe_addons
  };
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
  const allEntries = [...data.lpc_base, ...data.lpc_addons, ...data.fe_base, ...data.fe_addons];
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

export function formatPrice(entry: CommissionEntry): string {
  if (entry.inquire) {
    return 'Inquire for quote';
  }

  if (entry.price_min === null || entry.price_max === null) {
    return 'Contact for pricing';
  }

  let priceStr: string;

  if (entry.price_min === entry.price_max) {
    priceStr = `$${entry.price_min}`;
  } else {
    priceStr = `$${entry.price_min}–$${entry.price_max}`;
  }

  if (entry.price_base !== undefined && entry.price_per) {
    return `$${entry.price_base} base + ${priceStr}/${entry.price_per}`;
  }

  if (entry.price_per) {
    return `${priceStr}/${entry.price_per}`;
  }

  return priceStr;
}
