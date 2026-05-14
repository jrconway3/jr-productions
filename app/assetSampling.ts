import type { Asset } from './models/Asset';

function hasPrerequisites(asset: Asset): boolean {
  const prerequisites = asset.prerequisites;
  if (!prerequisites) return false;
  return (prerequisites.asset?.length ?? 0) > 0 || (prerequisites.category?.length ?? 0) > 0;
}

function getAssetWeight(asset: Asset, restrictedWeight: number): number {
  return hasPrerequisites(asset) ? restrictedWeight : 1;
}

/**
 * Weighted random sample without replacement.
 * Assets with prerequisites are still eligible, but deprioritized.
 */
export function pickRandomAssetsPreferUnrestricted(
  pool: Asset[],
  count: number,
  restrictedWeight = 0.25,
): Asset[] {
  if (count <= 0 || pool.length === 0) return [];

  const available = [...pool];
  const targetCount = Math.min(count, available.length);
  const result: Asset[] = [];

  while (result.length < targetCount && available.length > 0) {
    let totalWeight = 0;
    for (const asset of available) {
      totalWeight += getAssetWeight(asset, restrictedWeight);
    }

    let pickedIndex = 0;

    if (totalWeight > 0) {
      const pick = Math.random() * totalWeight;
      let running = 0;
      for (let i = 0; i < available.length; i += 1) {
        running += getAssetWeight(available[i], restrictedWeight);
        if (pick <= running) {
          pickedIndex = i;
          break;
        }
      }
    } else {
      pickedIndex = Math.floor(Math.random() * available.length);
    }

    const [pickedAsset] = available.splice(pickedIndex, 1);
    result.push(pickedAsset);
  }

  return result;
}

export function getCategorySampleCount(
  categoryPath: string,
  section: 'fe' | 'lpc',
): number {
  const depth = Math.max(0, categoryPath.split('/').length - 1);
  const base = section === 'lpc' ? 120 : 72;
  const min = section === 'lpc' ? 36 : 24;
  const decay = 0.75;
  return Math.max(min, Math.round(base * (decay ** depth)));
}
