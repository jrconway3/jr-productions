import Link from 'next/link';
import Image from 'next/image';
import type { Asset } from 'app/models/Asset';
import { toPublicAssetUrl } from 'app/assetUrl';

interface AssetCardProps {
  asset: Asset;
  sizeMode?: 'default' | 'featured';
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFromHeights(asset: Asset, heights: number[]): number {
  const groupingKey = `${asset.type}:${asset.path ?? asset.format}`;
  const index = hashString(groupingKey) % heights.length;
  return heights[index];
}

function getFeaturedPreviewHeight(asset: Asset): number {
  const pathValue = (asset.path ?? '').toLowerCase();
  const hasTrimTag = (asset.tags ?? []).some((tag) => tag.toLowerCase().includes('trim'));

  if (asset.type === 'lpc') {
    if (hasTrimTag || pathValue.includes('/trim')) return pickFromHeights(asset, [110, 130, 150]);
    if (pathValue.startsWith('hair/') || pathValue.startsWith('head/') || pathValue.startsWith('headwear/')) {
      return pickFromHeights(asset, [120, 140, 160]);
    }
    return pickFromHeights(asset, [140, 170, 200]);
  }

  if (asset.format === 'portrait') return pickFromHeights(asset, [220, 250, 280]);
  if (pathValue.startsWith('map-sprites')) return pickFromHeights(asset, [220, 250, 280]);
  if (pathValue.startsWith('battle-animations')) return pickFromHeights(asset, [240, 280, 320]);
  if (pathValue.startsWith('autotiles') || pathValue.startsWith('maps')) return pickFromHeights(asset, [180, 210, 240]);
  if (asset.format === 'gif') return pickFromHeights(asset, [220, 260, 300]);

  return pickFromHeights(asset, [210, 240, 270]);
}

export default function AssetCard({ asset, sizeMode = 'default' }: AssetCardProps) {
  const previewUrl = toPublicAssetUrl(asset.preview);
  const downloadUrl = toPublicAssetUrl(asset.download);
  const isFeatured = sizeMode === 'featured';
  const featuredHeight = isFeatured ? getFeaturedPreviewHeight(asset) : 0;

  return (
    <div className="sprite-card overflow-hidden">
      <div
        className="relative w-full asset-preview-surface"
        style={isFeatured
          ? { height: `${featuredHeight}px`, minHeight: `${featuredHeight}px` }
          : { aspectRatio: '1 / 1', minHeight: '160px' }}
      >
        {previewUrl && (
          <Image
            src={previewUrl}
            alt={asset.name}
            width={256}
            height={256}
            className="w-full h-full object-contain object-top"
            style={{ imageRendering: 'pixelated' }}
            unoptimized
          />
        )}
      </div>

      <div className="p-3">
        <h3 className="text-xs font-pixel leading-tight mb-1">{asset.name}</h3>

        <p className="font-body text-xs text-site-muted mb-2">{asset.license}</p>

        {(asset.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(asset.tags ?? []).slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="font-body text-xs px-1.5 py-0.5 bg-white/10 text-site-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            download
            className="mt-3 block text-center font-body text-xs py-1.5 px-3 bg-lpc-accent hover:bg-lpc-accentDark text-white transition-colors"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
