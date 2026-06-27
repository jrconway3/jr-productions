import JSZip from 'jszip';
import type { Asset, AnimationSpec } from './models/Asset';
import { expandLpcLayers } from './lpcLayers';

const LPC_CHARACTERS_BASE = '/assets/lpc/characters';

async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

export async function downloadLpcAsset(
  asset: Asset,
  animSpecs: Record<string, AnimationSpec>,
): Promise<void> {
  const zip = new JSZip();
  const assetLayers = expandLpcLayers(asset.layers);
  const animNames = Object.keys(animSpecs);

  const fetches: Promise<void>[] = [];

  for (const animName of animNames) {
    const spec = animSpecs[animName];
    const sourceFile = `${spec.source ?? animName}.png`;
    const bgLayers = (spec.background_layers ?? []).map((layer) => ({
      id: layer.id,
      path: layer.path,
    }));
    const assetLayerIds = new Set(assetLayers.map((layer) => layer.id).filter(Boolean));
    const activeBgLayers = bgLayers.filter((layer) => !layer.id || !assetLayerIds.has(layer.id));
    const mergedPaths = [...activeBgLayers.map((layer) => layer.path), ...assetLayers.map((layer) => layer.path)];
    const uniquePaths = [...new Set(mergedPaths)];

    for (const layerPath of uniquePaths) {
      const url = `${LPC_CHARACTERS_BASE}/${layerPath}/${sourceFile}`;
      const zipPath = `${layerPath}/${sourceFile}`;

      fetches.push(
        fetchBlob(url).then((blob) => {
          if (blob) zip.file(zipPath, blob);
        }),
      );
    }
  }

  await Promise.all(fetches);

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `${asset.id}.zip`);
}

export async function downloadStaticFiles(urls: string[], filename: string): Promise<void> {
  const zip = new JSZip();
  let added = 0;
  const normalizedUrls = urls
    .map((u) => u.trim())
    .filter((u) => u.length > 0 && !/^(https?:)?\/\//i.test(u));
  await Promise.all(
    normalizedUrls.map((url) => {
      const publicUrl = url.startsWith('/') ? url : `/${url}`;
      const entryPath = publicUrl.slice(1); // strip leading slash — preserves full path, avoids basename collisions
      return fetchBlob(publicUrl).then((blob) => {
        if (blob) { zip.file(entryPath, blob); added += 1; }
      });
    }),
  );
  if (added === 0) return;
  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, filename);
}

export async function downloadFeAsset(asset: Asset): Promise<void> {
  const url = asset.preview
    ? (asset.preview.startsWith('/') ? asset.preview : `/${asset.preview}`)
    : '';

  if (!url) return;

  const blob = await fetchBlob(url);
  if (!blob) return;

  const ext = url.includes('.') ? (url.split('.').pop() ?? 'gif') : 'gif';
  triggerDownload(blob, `${asset.id}.${ext}`);
}
