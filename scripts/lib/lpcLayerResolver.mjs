import { cleanLayerSegment, joinPosix } from './lpcPathUtils.mjs';

const BODY_TYPE_KEYS = ['male', 'muscular', 'female', 'teen', 'pregnant', 'child'];

function basenameFromLayerPath(layerPath) {
  const cleaned = cleanLayerSegment(layerPath);
  const segments = cleaned.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? cleaned;
}

export function resolveCompiledLayers({ sourceLayers, sourceRelativeDir }) {
  const compiled = [];

  for (const sourceLayer of sourceLayers ?? []) {
    const groups = new Map();

    for (const bodyType of BODY_TYPE_KEYS) {
      const pathValue = sourceLayer?.[bodyType];
      if (!pathValue || typeof pathValue !== 'string') continue;

      const cleaned = cleanLayerSegment(pathValue);
      if (!cleaned) continue;
      if (!groups.has(cleaned)) groups.set(cleaned, []);
      groups.get(cleaned).push(bodyType);
    }

    const groupEntries = [...groups.entries()];
    if (groupEntries.length === 0) continue;

    const layerAssets = groupEntries.map(([relativeLayerPath, bodyTypes]) => ({
      path: joinPosix(sourceRelativeDir, relativeLayerPath),
      body_types: bodyTypes,
    }));

    const layerId = sourceLayer.id || basenameFromLayerPath(groupEntries[0][0]);
    compiled.push({
      id: layerId,
      zPos: Number(sourceLayer.zPos ?? 0),
      assets: layerAssets,
    });
  }

  compiled.sort((a, b) => a.zPos - b.zPos);
  return compiled;
}
