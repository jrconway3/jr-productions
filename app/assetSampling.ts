import type { Asset } from './models/Asset';

/**
 * Given a randomly-selected set of assets, ensures every asset with prerequisites
 * is accompanied by a satisfying prerequisite asset in the result.
 *
 * - `asset` prerequisites: adds the first matching prerequisite found in `pool`.
 * - `category` prerequisites: adds a random asset with the required category from `pool`.
 * - If a prerequisite cannot be found in `pool` (e.g. narrow subcategory scope), the
 *   dependent asset is kept as-is so dedicated subcategory pages still render.
 * - Runs iteratively until the result is stable (handles chained prerequisites).
 */
export function resolvePrerequisites(selected: Asset[], pool: Asset[]): Asset[] {
  const poolById = new Map(pool.map((a) => [a.id, a]));
  const poolByCategory = new Map<string, Asset[]>();
  for (const a of pool) {
    if (a.category) {
      if (!poolByCategory.has(a.category)) poolByCategory.set(a.category, []);
      poolByCategory.get(a.category)!.push(a);
    }
  }

  const result = new Map<string, Asset>(selected.map((a) => [a.id, a]));
  let changed = true;

  while (changed) {
    changed = false;
    for (const [, asset] of [...result.entries()]) {
      const prereqs = asset.prerequisites;
      if (!prereqs) continue;

      if (prereqs.asset?.length) {
        const satisfied = prereqs.asset.some((reqId) => result.has(reqId));
        if (!satisfied) {
          const toAdd = prereqs.asset.find((reqId) => poolById.has(reqId));
          if (toAdd) {
            result.set(toAdd, poolById.get(toAdd)!);
            changed = true;
          }
        }
      }

      if (prereqs.category?.length) {
        const satisfied = prereqs.category.some((cat) =>
          [...result.values()].some((a) => a.category === cat),
        );
        if (!satisfied) {
          const candidates = prereqs.category.flatMap((cat) => poolByCategory.get(cat) ?? []);
          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            result.set(pick.id, pick);
            changed = true;
          }
        }
      }
    }
  }

  return [...result.values()];
}

export function hasPrerequisites(asset: Asset): boolean {
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

  const available = pool.map((asset) => ({ asset, weight: getAssetWeight(asset, restrictedWeight) }));
  let totalWeight = available.reduce((sum, x) => sum + x.weight, 0);
  const targetCount = Math.min(count, available.length);
  const result: Asset[] = [];

  while (result.length < targetCount && available.length > 0) {
    let pickedIndex = 0;

    if (totalWeight > 0) {
      const pick = Math.random() * totalWeight;
      let running = 0;
      for (let i = 0; i < available.length; i += 1) {
        running += available[i].weight;
        if (pick < running) {
          pickedIndex = i;
          break;
        }
      }
    } else {
      pickedIndex = Math.floor(Math.random() * available.length);
    }

    const [picked] = available.splice(pickedIndex, 1);
    totalWeight -= picked.weight;
    result.push(picked.asset);
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
