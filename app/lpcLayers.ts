import type { AssetLayer } from './models/Asset';

export interface ResolvedLpcLayer {
  id?: string;
  zPos: number;
  path: string;
  body_types?: string[];
}

/**
 * Normalizes LPC layer formats:
 * - grouped layer assets: { id, zPos, assets: [{ path, body_types }] }
 * - legacy flat layers: { id, zPos, path, body_types }
 */
export function expandLpcLayers(layers: AssetLayer[] | undefined): ResolvedLpcLayer[] {
  const resolved: ResolvedLpcLayer[] = [];

  for (const layer of layers ?? []) {
    if (Array.isArray(layer.assets) && layer.assets.length > 0) {
      for (const layerAsset of layer.assets) {
        if (!layerAsset?.path) continue;
        resolved.push({
          id: layer.id,
          zPos: layer.zPos,
          path: layerAsset.path,
          body_types: layerAsset.body_types,
        });
      }
      continue;
    }

    if (!layer.path) continue;
    resolved.push({
      id: layer.id,
      zPos: layer.zPos,
      path: layer.path,
      body_types: layer.body_types,
    });
  }

  return resolved;
}

export function collectLpcBodyTypes(layers: AssetLayer[] | undefined): string[] {
  const order: string[] = [];
  const seen = new Set<string>();

  for (const layer of expandLpcLayers(layers)) {
    for (const bodyType of layer.body_types ?? []) {
      if (seen.has(bodyType)) continue;
      seen.add(bodyType);
      order.push(bodyType);
    }
  }

  return order;
}
