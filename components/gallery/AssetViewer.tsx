import { useEffect, useRef, useState, useCallback } from 'react';
import type { Asset, AnimationCutout, AnimationSpec, ResolvedFeSpec } from 'app/models/Asset';
import type { BackgroundLayer } from 'app/models/Category';
import {
  createLpcMultiDirectionLoop,
  createFePortraitLoop,
  createFeMapSpriteLoop,
} from 'app/canvasRenderer';
import { expandLpcLayers } from 'app/lpcLayers';

const LPC_BASE = '/assets/lpc/characters';

const DEFAULT_DIRECTIONS = ['up', 'left', 'down', 'right'];

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M7.25 1v8.44L4.53 6.72l-1.06 1.06L8 12.31l4.53-4.53-1.06-1.06-2.72 2.72V1h-1.5z" />
      <path d="M2 13.5h12V15H2z" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 9.5 Q8 12 10.5 9.5" />
    </svg>
  );
}

function NeutralIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <line x1="5.5" y1="10" x2="10.5" y2="10" />
    </svg>
  );
}

// --- LPC: all directions at once ---

interface LpcAnimViewerProps {
  asset: Asset;
  animName: string;
  animSpec: AnimationSpec;
  bodyType?: string;
  backgroundLayers?: BackgroundLayer[];
}

const LAYOUT_CLASS: Record<string, string> = {
  row: 'flex flex-row',
  grid: 'grid grid-cols-2',
  column: 'flex flex-col',
};

export function LpcAnimViewer({ asset, animName, animSpec, bodyType, backgroundLayers }: LpcAnimViewerProps) {
  const directions = animSpec.directions ?? DEFAULT_DIRECTIONS;
  const layout = animSpec.layout ?? 'row';
  const cutouts = animSpec.cutouts as Record<string, AnimationCutout> | undefined;
  const rowsByDirection = Object.fromEntries(
    directions.map((dir) => {
      const dirCutout = cutouts?.[dir] ?? (cutouts ? Object.values(cutouts)[0] : undefined);
      const rows = dirCutout?.fps === 0
        ? Math.max(1, dirCutout.frames ?? animSpec.frames ?? 1)
        : 1;
      return [dir, rows];
    }),
  ) as Record<string, number>;
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stopRef.current?.();

    const canvases: Record<string, HTMLCanvasElement> = {};
    for (const dir of directions) {
      const el = canvasRefs.current[dir];
      if (el) canvases[dir] = el;
    }
    if (Object.keys(canvases).length === 0) return;

    if (animSpec.body_types?.length && (!bodyType || !animSpec.body_types.includes(bodyType))) {
      return;
    }

    const fileName = animSpec.source ?? animName;

    // Lenient filtering for background layers from animation spec (they're required)
    // Strict filtering for additional asset context layers
    const byBodyType = (layer: { body_types?: string[] }): boolean => {
      if (!layer.body_types || layer.body_types.length === 0) return true;
      if (bodyType) return layer.body_types.includes(bodyType);
      return false;
    };

    const allBgLayers = [...(backgroundLayers ?? []), ...(animSpec.background_layers ?? [])];
    const filteredBgLayers = allBgLayers.filter(byBodyType);

    const expandedAssetLayers = expandLpcLayers(asset.layers);
    const filteredExpandedLayers = expandedAssetLayers.filter(byBodyType);
    
    // Extra defensive: for each ID, pick ONLY the first matching layer
    // (this handles case where multiple assets in one layer ID both match bodyType)
    const deduplicatedAssetLayers: typeof filteredExpandedLayers = [];
    const seenIds = new Set<string | undefined>();
    for (const layer of filteredExpandedLayers) {
      if (!seenIds.has(layer.id)) {
        seenIds.add(layer.id);
        deduplicatedAssetLayers.push(layer);
      }
    }
    
    const assetLayerIds = new Set(deduplicatedAssetLayers.map((l) => l.id).filter(Boolean));

    // Asset layers with matching ID replace their background counterpart
    const activeBgLayers = filteredBgLayers.filter((l) => !l.id || !assetLayerIds.has(l.id));

    // Extra defensive: deduplicate background layers by ID as well
    const bgLayerIds = new Set<string | undefined>();
    const deduplicatedBgLayers = activeBgLayers.filter((layer) => {
      if (bgLayerIds.has(layer.id)) return false;
      bgLayerIds.add(layer.id);
      return true;
    });

    const allLayers = [
      ...deduplicatedBgLayers.map(({ path: p, zPos }) => ({ url: `${LPC_BASE}/${p}/${fileName}.png`, zPos })),
      ...deduplicatedAssetLayers.map(({ path: p, zPos }) => ({ url: `${LPC_BASE}/${p}/${fileName}.png`, zPos })),
    ];

    const layerUrls = allLayers.sort((a, b) => a.zPos - b.zPos);
    if (layerUrls.length === 0) return;

    const { stop } = createLpcMultiDirectionLoop(canvases, layerUrls, animSpec);
    stopRef.current = stop;
    return () => stop();
  }, [asset, animName, animSpec, directions, bodyType, backgroundLayers]);

  const layoutClass = LAYOUT_CLASS[layout] ?? LAYOUT_CLASS.row;

  return (
    <div className={`${layoutClass} w-full gap-px`}>
      {directions.map((dir) => (
        <canvas
          key={dir}
          ref={(el) => { canvasRefs.current[dir] = el; }}
          width={64}
          height={64 * (rowsByDirection[dir] ?? 1)}
          className="flex-1 min-w-0"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `1 / ${rowsByDirection[dir] ?? 1}`,
          }}
        />
      ))}
    </div>
  );
}

// --- FE Portrait: plays automatically, controls from spec ---

interface FePortraitViewerProps {
  asset: Asset;
  resolvedSpec: ResolvedFeSpec;
  onDownload?: () => void;
  downloading?: boolean;
}

export function FePortraitViewer({ asset, resolvedSpec, onDownload, downloading }: FePortraitViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loopRef = useRef<{ stop: () => void; updateState: (p: object) => void } | null>(null);

  const [playing, setPlaying] = useState(true);
  const [mouthVariant, setMouthVariant] = useState<'mouth_smile' | 'mouth_neutral'>('mouth_neutral');

  const cutouts = resolvedSpec.cutouts as Record<string, AnimationCutout>;
  const previewUrl = asset.preview
    ? (asset.preview.startsWith('/') ? asset.preview : `/${asset.preview}`)
    : '';

  const portrait = cutouts['portrait'];
  const chibi = cutouts['chibi'];
  const pw = portrait?.width ?? 96;
  const ph = portrait?.height ?? 80;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewUrl) return;

    loopRef.current?.stop();
    const loop = createFePortraitLoop(canvas, previewUrl, cutouts);
    loopRef.current = loop;
    return () => loop.stop();
  }, [previewUrl, cutouts]);

  // Sync interactive state into the running loop without re-creating it.
  useEffect(() => {
    loopRef.current?.updateState({ mouthVariant, playing });
  }, [mouthVariant, playing]);

  const togglePlaying = useCallback(() => {
    const next = !playing;
    setPlaying(next);
    loopRef.current?.updateState({ playing: next });
  }, [playing]);

  const toggleMouth = useCallback(() => {
    const next = mouthVariant === 'mouth_smile' ? 'mouth_neutral' : 'mouth_smile';
    setMouthVariant(next);
    loopRef.current?.updateState({ mouthVariant: next });
  }, [mouthVariant]);

  const cw = chibi?.width ?? 32;
  const ch = chibi?.height ?? 32;

  return (
    <div className="flex gap-2 items-start w-full">
      <canvas
        ref={canvasRef}
        width={pw}
        height={ph}
        className="min-w-0"
        style={{ imageRendering: 'pixelated', aspectRatio: `${pw} / ${ph}`, flex: '1 1 0' }}
      />
      <div className="flex flex-col items-start gap-1 flex-shrink-0">
        {chibi && (
          <div style={{ width: cw * 2, height: ch * 2, overflow: 'hidden' }}>
            <div
              style={{
                width: cw,
                height: ch,
                imageRendering: 'pixelated',
                backgroundImage: `url('${encodeURI(previewUrl)}')`,
                backgroundPosition: `-${chibi.x ?? 96}px -${chibi.y ?? 16}px`,
                backgroundRepeat: 'no-repeat',
                transform: 'scale(2)',
                transformOrigin: 'top left',
              }}
            />
          </div>
        )}
        <div className="flex" style={{ width: cw * 2 }}>
          <button
            onClick={togglePlaying}
            className="flex-1 flex items-center justify-center bg-white/20 hover:bg-white/35 text-white transition-colors"
            style={{ height: cw, aspectRatio: '1' }}
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause portrait animation' : 'Play portrait animation'}
            aria-pressed={playing}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            onClick={toggleMouth}
            className="flex-1 flex items-center justify-center bg-white/20 hover:bg-white/35 text-white transition-colors"
            style={{ height: cw, aspectRatio: '1' }}
            title={mouthVariant === 'mouth_smile' ? 'Neutral mouth' : 'Smile'}
            aria-label={mouthVariant === 'mouth_smile' ? 'Switch to neutral mouth' : 'Switch to smiling mouth'}
            aria-pressed={mouthVariant === 'mouth_smile'}
          >
            {mouthVariant === 'mouth_smile' ? <SmileIcon /> : <NeutralIcon />}
          </button>
        </div>
        {onDownload && (
          <button
            onClick={onDownload}
            disabled={downloading}
            title="Download"
            aria-label="Download portrait"
            aria-busy={downloading}
            aria-disabled={downloading}
            className="flex items-center justify-center bg-white/20 hover:bg-white/35 text-white/70 hover:text-white transition-colors disabled:opacity-40"
            style={{ width: cw * 2, height: Math.round(cw * 0.625) }}
          >
            {downloading ? <span className="text-[10px]">⏳</span> : <DownloadIcon />}
          </button>
        )}
      </div>
    </div>
  );
}

// --- FE Map Sprite ---

interface FeMapSpriteViewerProps {
  asset: Asset;
  resolvedSpec: ResolvedFeSpec;
}

export function FeMapSpriteViewer({ asset, resolvedSpec }: FeMapSpriteViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const animations = asset.animations ?? ['stand'];
  const cutouts = resolvedSpec.cutouts as Record<string, AnimationCutout>;
  const fw = resolvedSpec.frame_width ?? 16;
  const fh = resolvedSpec.frame_height ?? 16;

  const previewUrl = asset.preview
    ? (asset.preview.startsWith('/') ? asset.preview : `/${asset.preview}`)
    : '';

  // Derive stand URL from preview (preview is typically the stand file)
  const selectedAnim = animations[0] ?? 'stand';
  const fileUrl = previewUrl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fileUrl) return;

    stopRef.current?.();
    const cutout = cutouts[selectedAnim];
    if (!cutout) return;

    const { stop } = createFeMapSpriteLoop(canvas, fileUrl, cutout, fw, fh);
    stopRef.current = stop;
    return () => stop();
  }, [fileUrl, cutouts, selectedAnim, fw, fh]);

  return (
    <canvas
      ref={canvasRef}
      width={fw}
      height={fh}
      className="w-full aspect-square"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// --- FE Battle: just display the GIF ---

export function FeBattleViewer({ asset }: { asset: Asset }) {
  const url = asset.preview
    ? (asset.preview.startsWith('/') ? asset.preview : `/${asset.preview}`)
    : '';
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={asset.name}
      className="w-full h-auto block"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
