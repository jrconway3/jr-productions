import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useState } from 'react';
import type { Asset, AnimationSpec, ResolvedFeSpec, ResolvedLpcSpec } from 'app/models/Asset';
import type { BackgroundLayer } from 'app/models/Category';
import { toPublicAssetUrl } from 'app/assetUrl';
import { downloadLpcAsset, downloadFeAsset } from 'app/downloadAsset';

const { LpcAnimViewer, FePortraitViewer, FeMapSpriteViewer, FeBattleViewer } = {
  LpcAnimViewer: dynamic(
    () => import('components/gallery/AssetViewer').then((m) => m.LpcAnimViewer),
    { ssr: false },
  ),
  FePortraitViewer: dynamic(
    () => import('components/gallery/AssetViewer').then((m) => m.FePortraitViewer),
    { ssr: false },
  ),
  FeMapSpriteViewer: dynamic(
    () => import('components/gallery/AssetViewer').then((m) => m.FeMapSpriteViewer),
    { ssr: false },
  ),
  FeBattleViewer: dynamic(
    () => import('components/gallery/AssetViewer').then((m) => m.FeBattleViewer),
    { ssr: false },
  ),
};

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className="w-3.5 h-3.5"
      aria-hidden="true"
    >
      <path d="M7.25 1v8.44L4.53 6.72l-1.06 1.06L8 12.31l4.53-4.53-1.06-1.06-2.72 2.72V1h-1.5z" />
      <path d="M2 13.5h12V15H2z" />
    </svg>
  );
}

/** "pirate_reskin" → "Pirate Reskin", "hair" → "Hair" */
function formatSlug(s: string): string {
  return s.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function creditsLine(asset: Asset): string | null {
  if (!asset.credits?.length) return null;
  const authors = [...new Set(asset.credits.flatMap((c) => c.authors))].join(', ');
  return asset.license ? `${authors} • ${asset.license}` : authors;
}

// --- LPC card (one animation, all directions) ---

interface LpcCardProps {
  asset: Asset;
  animName: string;
  animSpec?: AnimationSpec;
  bodyType?: string;
  backgroundLayers?: BackgroundLayer[];
  allAnimSpecs?: ResolvedLpcSpec;
}

function lpcDisplayName(asset: Asset): string {
  return asset.name;
}

function lpcAspectRatio(spec: AnimationSpec | undefined): string {
  const directions = spec?.directions ?? ['up', 'left', 'down', 'right'];
  const layout = spec?.layout ?? 'row';
  const cutouts = spec?.cutouts as Record<string, { fps?: number; frames?: number }> | undefined;
  const maxRows = directions.reduce((max, dir) => {
    const cut = cutouts?.[dir];
    if (cut?.fps === 0) return Math.max(max, cut.frames ?? spec?.frames ?? 1);
    return max;
  }, 1);
  if (layout === 'grid') return '1 / 1';
  if (layout === 'column') return `1 / ${directions.length * maxRows}`;
  return `${directions.length} / ${maxRows}`;
}

export function LpcCard({ asset, animName, animSpec, bodyType, backgroundLayers, allAnimSpecs }: LpcCardProps) {
  const [downloading, setDownloading] = useState(false);
  const specsForDownload = allAnimSpecs ?? (animSpec ? { [animName]: animSpec } : null);
  const displayName = lpcDisplayName(asset);
  const credits = creditsLine(asset);

  const handleDownload = async () => {
    if (!specsForDownload || downloading) return;
    setDownloading(true);
    try { await downloadLpcAsset(asset, specsForDownload); }
    finally { setDownloading(false); }
  };

  return (
    <div className="sprite-card overflow-hidden" id={`${asset.id}:${animName}:${bodyType ?? ''}`}>
      <div className="relative w-full asset-preview-surface" style={{ aspectRatio: lpcAspectRatio(animSpec) }}>
        {animSpec ? (
          <LpcAnimViewer asset={asset} animName={animName} animSpec={animSpec} bodyType={bodyType} backgroundLayers={backgroundLayers} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-site-muted font-body text-xs opacity-40">
            {animName}
          </div>
        )}
        {specsForDownload && (asset.layers?.length ?? 0) > 0 && (
          <button onClick={handleDownload} disabled={downloading} title="Download ZIP"
            aria-label="Download ZIP" aria-busy={downloading} aria-disabled={downloading}
            className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/75 rounded p-1 text-white/70 hover:text-white transition-colors disabled:opacity-40">
            {downloading ? <span className="text-[10px]">⏳</span> : <DownloadIcon />}
          </button>
        )}
      </div>

      <div className="px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-1">
          <p className="text-xs font-pixel leading-tight">{displayName}</p>
          {bodyType && <p className="text-[10px] font-pixel leading-tight opacity-30 shrink-0">{formatSlug(bodyType)}</p>}
        </div>
        {credits && <p className="font-body text-xs opacity-50 leading-tight break-words">{credits}</p>}
      </div>
    </div>
  );
}

// --- LPC grouped card (multiple animations stacked) ---

interface LpcGroupCardProps {
  asset: Asset;
  animNames: string[];
  specs: (AnimationSpec | undefined)[];
  bodyType?: string;
  backgroundLayers?: BackgroundLayer[];
  allAnimSpecs?: ResolvedLpcSpec;
}

export function LpcGroupCard({ asset, animNames, specs, bodyType, backgroundLayers, allAnimSpecs }: LpcGroupCardProps) {
  const [downloading, setDownloading] = useState(false);
  const specsForDownload = allAnimSpecs ?? null;
  const displayName = lpcDisplayName(asset);
  const credits = creditsLine(asset);

  const handleDownload = async () => {
    if (!specsForDownload || downloading) return;
    setDownloading(true);
    try { await downloadLpcAsset(asset, specsForDownload); }
    finally { setDownloading(false); }
  };

  const totalDirs = specs.reduce((sum, spec) => sum + (spec?.directions?.length ?? 4), 0);

  return (
    <div className="sprite-card overflow-hidden" id={`${asset.id}:${animNames.join('+')}:${bodyType ?? ''}`}>
      <div className="relative w-full asset-preview-surface flex flex-row" style={{ aspectRatio: `${totalDirs} / 1` }}>
        {animNames.map((animName, i) => {
          const spec = specs[i];
          if (!spec) return null;
          const dirCount = spec.directions?.length ?? 4;
          return (
            <div key={animName} style={{ flex: dirCount }} className="min-w-0">
              <LpcAnimViewer asset={asset} animName={animName} animSpec={spec} bodyType={bodyType} backgroundLayers={backgroundLayers} />
            </div>
          );
        })}
        {specsForDownload && (asset.layers?.length ?? 0) > 0 && (
          <button onClick={handleDownload} disabled={downloading} title="Download ZIP"
            aria-label="Download ZIP" aria-busy={downloading} aria-disabled={downloading}
            className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/75 rounded p-1 text-white/70 hover:text-white transition-colors disabled:opacity-40">
            {downloading ? <span className="text-[10px]">⏳</span> : <DownloadIcon />}
          </button>
        )}
      </div>

      <div className="px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-1">
          <p className="text-xs font-pixel leading-tight">{displayName}</p>
          {bodyType && <p className="text-[10px] font-pixel leading-tight opacity-30 shrink-0">{formatSlug(bodyType)}</p>}
        </div>
        {credits && <p className="font-body text-xs opacity-50 leading-tight break-words">{credits}</p>}
      </div>
    </div>
  );
}

// --- FE card ---

interface FeCardProps {
  asset: Asset;
  feSpec?: ResolvedFeSpec;
}

export function FeCard({ asset, feSpec }: FeCardProps) {
  const [downloading, setDownloading] = useState(false);
  const previewUrl = toPublicAssetUrl(asset.preview);

  const specId = feSpec?.id;
  const isPortrait = specId === 'fe_portrait';
  const isMapSprite = specId === 'fe_map_sprite';
  const isBattle = feSpec?.format === 'gif';

  const displayName = asset.name;
  const credits = creditsLine(asset);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try { await downloadFeAsset(asset); }
    finally { setDownloading(false); }
  };

  const aspectRatio = isPortrait || isBattle ? undefined : '1 / 1';

  const renderViewer = () => {
    if (!feSpec) {
      return previewUrl ? (
        <Image src={previewUrl} alt={asset.name} width={256} height={256}
          className="w-full h-full object-contain object-top"
          style={{ imageRendering: 'pixelated' }} unoptimized />
      ) : null;
    }
    if (isBattle) return <FeBattleViewer asset={asset} />;
    if (isPortrait) return <FePortraitViewer asset={asset} resolvedSpec={feSpec} onDownload={previewUrl ? handleDownload : undefined} downloading={downloading} />;
    if (isMapSprite) return <FeMapSpriteViewer asset={asset} resolvedSpec={feSpec} />;
    return previewUrl ? (
      <Image src={previewUrl} alt={asset.name} width={256} height={256}
        className="w-full h-full object-contain object-top"
        style={{ imageRendering: 'pixelated' }} unoptimized />
    ) : null;
  };

  return (
    <div className="sprite-card overflow-hidden">
      <div className="relative w-full asset-preview-surface" style={{ aspectRatio }}>
        {renderViewer()}
        {previewUrl && !isPortrait && (
          <button onClick={handleDownload} disabled={downloading} title="Download"
            aria-label="Download" aria-busy={downloading} aria-disabled={downloading}
            className="absolute top-1.5 right-1.5 bg-black/50 hover:bg-black/75 rounded p-1 text-white/70 hover:text-white transition-colors disabled:opacity-40">
            {downloading ? <span className="text-[10px]">⏳</span> : <DownloadIcon />}
          </button>
        )}
      </div>

      <div className="px-2 py-1.5">
        <p className="text-xs font-pixel leading-tight break-words">{displayName}</p>
        {credits && <p className="font-body text-xs opacity-50 leading-tight break-words">{credits}</p>}
      </div>
    </div>
  );
}

// --- Legacy default export for non-animation fallback ---

interface AssetCardProps {
  asset: Asset;
  sizeMode?: 'default' | 'featured';
}

export default function AssetCard({ asset }: AssetCardProps) {
  const previewUrl = toPublicAssetUrl(asset.preview);
  const downloadUrl = toPublicAssetUrl(asset.download);

  return (
    <div className="sprite-card overflow-hidden">
      <div className="relative w-full asset-preview-surface" style={{ aspectRatio: '1 / 1', minHeight: '120px' }}>
        {previewUrl && (
          <Image src={previewUrl} alt={asset.name} width={256} height={256}
            className="w-full h-full object-contain object-top"
            style={{ imageRendering: 'pixelated' }} unoptimized />
        )}
      </div>

      <div className="px-2 py-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-pixel leading-tight break-words min-w-0">{asset.name}</p>
        {downloadUrl && (
          <a href={downloadUrl} download title="Download"
            className="flex-shrink-0 text-site-muted hover:text-white transition-colors">
            <DownloadIcon />
          </a>
        )}
      </div>
    </div>
  );
}
