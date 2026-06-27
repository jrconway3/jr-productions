import type { Asset } from './models/Asset';
import type { BackgroundLayer } from './models/Category';
import { expandLpcLayers } from './lpcLayers';

export function buildPrereqLayersByAssetId(assets: Asset[]): Map<string, BackgroundLayer[]> {
  const byId = new Map<string, Asset>();
  const bySubcategory = new Map<string, Asset[]>();
  const byCategory = new Map<string, Asset[]>();
  for (const a of assets) {
    byId.set(a.id, a);
    if (a.subcategory) {
      if (!bySubcategory.has(a.subcategory)) bySubcategory.set(a.subcategory, []);
      bySubcategory.get(a.subcategory)!.push(a);
    }
    if (a.category) {
      if (!byCategory.has(a.category)) byCategory.set(a.category, []);
      byCategory.get(a.category)!.push(a);
    }
  }
  const result = new Map<string, BackgroundLayer[]>();
  for (const a of assets) {
    const prereqs = a.prerequisites;
    if (!prereqs) continue;
    let prereqAsset: Asset | undefined;
    if (prereqs.asset?.length) {
      for (const id of prereqs.asset) {
        const candidate = byId.get(id);
        if (candidate && candidate.id !== a.id) { prereqAsset = candidate; break; }
      }
    }
    if (!prereqAsset && prereqs.subcategory?.length) {
      for (const sub of prereqs.subcategory) {
        const cs = bySubcategory.get(sub) ?? [];
        prereqAsset = cs.find((c) => c.id !== a.id && !c.prerequisites?.subcategory?.includes(sub))
          ?? cs.find((c) => c.id !== a.id);
        if (prereqAsset) break;
      }
    }
    if (!prereqAsset && prereqs.category?.length) {
      for (const cat of prereqs.category) {
        const cs = byCategory.get(cat) ?? [];
        prereqAsset = cs.find((c) => c.id !== a.id && !c.prerequisites?.category?.includes(cat))
          ?? cs.find((c) => c.id !== a.id);
        if (prereqAsset) break;
      }
    }
    if (!prereqAsset) continue;
    result.set(a.id, expandLpcLayers(prereqAsset.layers));
  }
  return result;
}
