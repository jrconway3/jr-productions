import fs from 'fs';
import path from 'path';
import type { Asset, AnimationSpec, AnimationCutout, ResolvedLpcSpec, ResolvedFeSpec } from './models/Asset';
import { expandLpcLayers, collectLpcBodyTypes } from './lpcLayers';

const ANIMATIONS_ROOT = path.join(process.cwd(), 'data', 'animations');
const LPC_DATA_ROOT = path.join(process.cwd(), 'data', 'lpc');
const LPC_PUBLIC_ROOT = path.join(process.cwd(), 'public', 'assets', 'lpc', 'characters');

let lpcAssetIndex: Map<string, string> | null = null;

function buildLpcAssetIndex(): Map<string, string> {
  if (lpcAssetIndex) return lpcAssetIndex;

  const index = new Map<string, string>();
  const walk = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'meta.json') {
        const id = path.basename(entry.name, '.json');
        if (!index.has(id)) index.set(id, fullPath);
      }
    }
  };

  walk(LPC_DATA_ROOT);
  lpcAssetIndex = index;
  return index;
}

function loadLpcAssetById(assetId: string): Asset | null {
  const index = buildLpcAssetIndex();
  const jsonPath = index.get(assetId);
  if (!jsonPath || !fs.existsSync(jsonPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Asset;
  } catch {
    return null;
  }
}

function resolveGlobalLayerRefToJsonPath(ref: string): string {
  const normalized = ref.replace(/\\/g, '/').replace(/^\/+/, '');
  const withExt = normalized.endsWith('.json') ? normalized : `${normalized}.json`;
  return path.join(LPC_DATA_ROOT, withExt);
}

function resolveGlobalLayers(spec: AnimationSpec): AnimationSpec {
  const refs = spec.global_layers;
  if (!refs?.length) return spec;

  const resolvedLayers = [] as NonNullable<AnimationSpec['background_layers']>;
  const pushExpandedLayers = (rawLayers: unknown[]) => {
    for (const layer of expandLpcLayers(rawLayers as Asset['layers'])) {
      resolvedLayers.push({
        id: layer.id,
        path: layer.path,
        zPos: layer.zPos,
        body_types: layer.body_types,
      });
    }
  };

  const pushPulledLayersWithOverride = (assetId: string, layerOverride: Record<string, unknown>) => {
    const pulled = loadLpcAssetById(assetId);
    if (!pulled) return;

    const pulledLayers = pulled.layers ?? [];
    const overriddenRawLayers = pulledLayers.length > 0
      ? pulledLayers.map((layer) => {
          const merged = { ...layer, ...layerOverride } as Record<string, unknown>;

          // Grouped LPC layers store selection filters on nested assets; apply overrides there.
          if (Array.isArray(layer.assets) && layer.assets.length > 0) {
            const mergedAssets: Record<string, unknown>[] = [];
            for (const layerAsset of layer.assets) {
              const next = { ...layerAsset } as Record<string, unknown>;
              if (typeof layerOverride.path === 'string') next.path = layerOverride.path;
              if (Array.isArray(layerOverride.body_types)) {
                const orig = layerAsset.body_types;
                if (orig?.length) {
                  const intersection = orig.filter((bt) => (layerOverride.body_types as string[]).includes(bt));
                  if (intersection.length === 0) continue;
                  next.body_types = intersection;
                } else {
                  next.body_types = layerOverride.body_types;
                }
              }
              mergedAssets.push(next);
            }
            merged.assets = mergedAssets;
            delete merged.path;
            delete merged.body_types;
          }

          return merged;
        })
      : [layerOverride];

    pushExpandedLayers(overriddenRawLayers);
  };

  for (const ref of refs) {
    if (typeof ref === 'string') {
      const jsonPath = resolveGlobalLayerRefToJsonPath(ref);
      if (!fs.existsSync(jsonPath)) continue;

      try {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Asset;
        pushExpandedLayers((parsed.layers ?? []) as unknown[]);
      } catch {
        // Ignore malformed layer refs in animation specs.
      }
      continue;
    }

    const rawRef = ref as Record<string, unknown>;
    const overrideId = (typeof rawRef.id === 'string' ? rawRef.id : undefined)
      ?? (typeof rawRef.ID === 'string' ? rawRef.ID : undefined);
    const layerOverride = {
      ...rawRef,
      ...(overrideId ? { id: overrideId } : {}),
    } as Record<string, unknown>;
    const assetRef = rawRef.asset;
    delete layerOverride.asset;
    delete layerOverride.ID;

    const assetId = typeof assetRef === 'string' ? assetRef : undefined;
    if (assetId) {
      pushPulledLayersWithOverride(assetId, layerOverride);
      continue;
    }

    const conditionalAssetRefs = Array.isArray(assetRef) ? assetRef : undefined;
    if (conditionalAssetRefs) {
      for (const conditionalRef of conditionalAssetRefs) {
        if (!conditionalRef || typeof conditionalRef !== 'object') continue;
        const conditionalRawRef = conditionalRef as Record<string, unknown>;
        const conditionalAssetId = typeof conditionalRawRef.asset === 'string'
          ? conditionalRawRef.asset
          : undefined;
        if (!conditionalAssetId) continue;

        const conditionalOverrideId = (typeof conditionalRawRef.id === 'string'
          ? conditionalRawRef.id
          : undefined) ?? (typeof conditionalRawRef.ID === 'string' ? conditionalRawRef.ID : undefined);
        const conditionalOverride = {
          ...conditionalRawRef,
          ...(conditionalOverrideId ? { id: conditionalOverrideId } : {}),
        } as Record<string, unknown>;
        delete conditionalOverride.asset;
        delete conditionalOverride.ID;

        // Item-level override fields win over outer layer-level overrides.
        pushPulledLayersWithOverride(conditionalAssetId, { ...layerOverride, ...conditionalOverride });
      }
      continue;
    }

    // Direct layer object (no asset indirection).
    pushExpandedLayers([layerOverride]);
  }

  if (resolvedLayers.length === 0) return spec;
  return { ...spec, background_layers: resolvedLayers };
}

function loadSpecFile(filePath: string): AnimationSpec {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AnimationSpec;
}

function loadLpcSpecs(): ResolvedLpcSpec {
  const dir = path.join(ANIMATIONS_ROOT, 'lpc');
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const spec = resolveGlobalLayers(loadSpecFile(path.join(dir, f)));
        return [spec.id, spec];
      }),
  );
}

function loadFeSpec(name: string): AnimationSpec | null {
  const filePath = path.join(ANIMATIONS_ROOT, 'fe', `${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  return loadSpecFile(filePath);
}

function mergeCutout(
  base: AnimationCutout,
  override: Partial<AnimationCutout>,
): AnimationCutout {
  return { ...base, ...override };
}

function mergeLpcCutouts(
  specCutouts: Record<string, AnimationCutout>,
  assetCutouts: Record<string, Partial<AnimationCutout>> | undefined,
): Record<string, AnimationCutout> {
  if (!assetCutouts) return specCutouts;
  return Object.fromEntries(
    Object.entries(specCutouts).map(([dir, cutout]) => [
      dir,
      assetCutouts[dir] ? mergeCutout(cutout, assetCutouts[dir]) : cutout,
    ]),
  );
}

export function resolveAssetSpecs(asset: Asset): ResolvedLpcSpec | ResolvedFeSpec | null {
  if (!asset.animation_spec) return null;

  const spec = asset.animation_spec;

  if (spec === 'lpc') {
    const allLpcSpecs = loadLpcSpecs();
    const activeAnimations = asset.animations ?? [];
    const result: ResolvedLpcSpec = {};

    for (const animName of activeAnimations) {
      const animSpec = allLpcSpecs[animName];
      if (!animSpec) continue;

      const assetAnimOverrides = asset.cutouts?.[animName] as
        | Record<string, Partial<AnimationCutout>>
        | undefined;

      const resolvedCutouts = animSpec.cutouts
        ? mergeLpcCutouts(
            animSpec.cutouts as Record<string, AnimationCutout>,
            assetAnimOverrides,
          )
        : animSpec.cutouts;

      result[animName] = { ...animSpec, cutouts: resolvedCutouts };
    }

    return result;
  }

  if (spec === 'fe/portrait') {
    const base = loadFeSpec('portrait');
    if (!base) return null;

    const baseCutouts = (base.cutouts ?? {}) as Record<string, AnimationCutout>;
    const assetCutoutOverrides = asset.cutouts as
      | Record<string, Partial<AnimationCutout>>
      | undefined;

    const mergedCutouts: Record<string, AnimationCutout> = {};
    for (const [key, cutout] of Object.entries(baseCutouts)) {
      const override = assetCutoutOverrides?.[key];
      mergedCutouts[key] = override ? mergeCutout(cutout, override) : cutout;
    }

    return { ...base, cutouts: mergedCutouts } as ResolvedFeSpec;
  }

  if (spec === 'fe/map_sprite') {
    const base = loadFeSpec('map_sprite');
    return base as ResolvedFeSpec | null;
  }

  if (spec === 'fe/battle') {
    const base = loadFeSpec('battle');
    return base as ResolvedFeSpec | null;
  }

  return null;
}

export function resolveAssetsSpecs(
  assets: Asset[],
): Record<string, ResolvedLpcSpec | ResolvedFeSpec> {
  const result: Record<string, ResolvedLpcSpec | ResolvedFeSpec> = {};
  for (const asset of assets) {
    const resolved = resolveAssetSpecs(asset);
    if (resolved) result[asset.id] = resolved;
  }
  return result;
}

/**
 * Resolve a single animation spec per LPC asset (randomised for variety) and
 * a minimal FE spec. Returns both the specs map and the chosen animName per
 * asset so the client can display the right animation without re-computing.
 */
export function resolveHomepageSpecs(
  assets: Asset[],
): {
  specs: Record<string, AnimationSpec | ResolvedFeSpec>;
  animNames: Record<string, string>;
  bodyTypes: Record<string, string>;
} {
  const lpcSpecs = loadLpcSpecs();
  const specs: Record<string, AnimationSpec | ResolvedFeSpec> = {};
  const animNames: Record<string, string> = {};
  const bodyTypes: Record<string, string> = {};

  const supportsBodyType = (asset: Asset, animName: string, spec: AnimationSpec, bodyType: string): boolean => {
    const sourceFile = `${spec.source ?? animName}.png`;

    const byBodyType = (layer: { body_types?: string[] }) =>
      !layer.body_types || layer.body_types.includes(bodyType);

    const bgLayers = (spec.background_layers ?? []).filter(byBodyType);
    const assetLayers = expandLpcLayers(asset.layers).filter(byBodyType);
    
    // If animation spec restricts body types, enforce it strictly
    if (spec.body_types?.length && !spec.body_types.includes(bodyType)) {
      return false;
    }

    const assetLayerIds = new Set(assetLayers.map((l) => l.id).filter(Boolean));
    const activeBgLayers = bgLayers.filter((layer) => !layer.id || !assetLayerIds.has(layer.id));
    const allLayerPaths = [
      ...activeBgLayers.map((layer) => layer.path),
      ...assetLayers.map((layer) => layer.path),
    ];

    // Must have at least some layers to render
    if (allLayerPaths.length === 0) return false;
    
    // All layer files must exist
    return allLayerPaths.every((layerPath) => fs.existsSync(path.join(LPC_PUBLIC_ROOT, layerPath, sourceFile)));
  };

  for (const asset of assets) {
    if (asset.animation_spec === 'lpc') {
      const candidateBodyTypes = asset.body_types?.length
        ? asset.body_types
        : collectLpcBodyTypes(asset.layers);

      const available = (asset.animations ?? []).filter((n) => {
        const s = lpcSpecs[n];
        if (!s || s.standalone === false) return false;

        const compatibleBodyTypes = candidateBodyTypes.filter((bodyType) => {
          if (s.body_types?.length && !s.body_types.includes(bodyType)) return false;
          return supportsBodyType(asset, n, s, bodyType);
        });
        return compatibleBodyTypes.length > 0;
      });

      // Prefer visually interesting animations; fall back to any standalone.
      const interesting = available.filter((n) => !['walk', 'idle', 'run', 'combat'].includes(n));
      const pool = interesting.length > 0 ? interesting : available;
      const animName = pool.length > 0
        ? pool[Math.floor(Math.random() * pool.length)]
        : asset.animations?.[0];
      if (!animName) continue;
      const spec = lpcSpecs[animName];
      if (spec) {
        const compatibleBodyTypes = candidateBodyTypes.filter((bodyType) => {
          if (spec.body_types?.length && !spec.body_types.includes(bodyType)) return false;
          return supportsBodyType(asset, animName, spec, bodyType);
        });

        if (compatibleBodyTypes.length === 0) continue;

        // Prefer child/teen body types for visual variety on homepage
        const childPreference = ['child', 'teen', 'pregnant', 'female', 'male', 'muscular'];
        const sortedByPreference = [...compatibleBodyTypes].sort(
          (a, b) => childPreference.indexOf(a) - childPreference.indexOf(b)
        );
        const bodyType = sortedByPreference[0];
        specs[asset.id] = spec;
        animNames[asset.id] = animName;
        bodyTypes[asset.id] = bodyType;
      }
    } else {
      const fe = resolveAssetSpecs(asset);
      if (fe) specs[asset.id] = fe as ResolvedFeSpec;
    }
  }

  return { specs, animNames, bodyTypes };
}
