import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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

function BlinkOnIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
      <path d="M2 8c1.5-2 3.5-3 6-3s4.5 1 6 3c-1.5 2-3.5 3-6 3S3.5 10 2 8z" />
      <circle cx="8" cy="8" r="1.5" />
    </svg>
  );
}

function BlinkOffIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
      <path d="M2 8c1.5-2 3.5-3 6-3s4.5 1 6 3" />
      <path d="M3 11l10-6" />
      <path d="M3 5l10 6" />
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
  const [hasRenderableLayers, setHasRenderableLayers] = useState(true);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { queueMicrotask(() => setInView(true)); return; }
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '100px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) { stopRef.current?.(); return; }
    stopRef.current?.();

    let cancelled = false;

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

    const assetLayers = expandLpcLayers(asset.layers).filter(byBodyType);

    const allLayers = [
      ...filteredBgLayers.map(({ path: p, zPos }) => ({ url: `${LPC_BASE}/${p}/${fileName}.png`, zPos })),
      ...assetLayers.map(({ path: p, zPos }) => ({ url: `${LPC_BASE}/${p}/${fileName}.png`, zPos })),
    ];

    const layerUrls = allLayers.sort((a, b) => a.zPos - b.zPos);
    if (layerUrls.length === 0) {
      Promise.resolve().then(() => { if (!cancelled) setHasRenderableLayers(false); });
      return () => { cancelled = true; };
    }

    const loop = createLpcMultiDirectionLoop(canvases, layerUrls, animSpec);
    loop.ready
      .then((layerCount) => {
        if (!cancelled) setHasRenderableLayers(layerCount > 0);
      })
      .catch(() => {
        if (!cancelled) setHasRenderableLayers(false);
      });

    const { stop } = loop;
    stopRef.current = stop;
    return () => {
      cancelled = true;
      stop();
    };
  }, [inView, asset, animName, animSpec, directions, bodyType, backgroundLayers]);

  const layoutClass = LAYOUT_CLASS[layout] ?? LAYOUT_CLASS.row;

  return (
    <div ref={containerRef} className="relative w-full">
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
      {!hasRenderableLayers && (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] font-body text-site-muted opacity-80">
          Preview unavailable
        </div>
      )}
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopRef = useRef<{ stop: () => void; updateState: (p: object) => void } | null>(null);
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(true);
  const [blinkEnabled, setBlinkEnabled] = useState(false);
  const [mouthVariant, setMouthVariant] = useState<'mouth_smile' | 'mouth_neutral'>('mouth_neutral');

  const cutouts = useMemo(() => resolvedSpec.cutouts as Record<string, AnimationCutout>, [resolvedSpec]);
  const previewUrl = asset.preview
    ? (asset.preview.startsWith('/') ? asset.preview : `/${asset.preview}`)
    : '';

  const portrait = cutouts['portrait'];
  const chibi = cutouts['chibi'];
  const pw = portrait?.width ?? 96;
  const ph = portrait?.height ?? 80;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { queueMicrotask(() => setInView(true)); return; }
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '100px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) { loopRef.current?.stop(); return; }
    const canvas = canvasRef.current;
    if (!canvas || !previewUrl) return;

    loopRef.current?.stop();
    const loop = createFePortraitLoop(canvas, previewUrl, cutouts, { blinkEnabled: false });
    loopRef.current = loop;
    return () => loop.stop();
  }, [inView, previewUrl, cutouts]);

  // Sync interactive state into the running loop without re-creating it.
  useEffect(() => {
    loopRef.current?.updateState({ mouthVariant, playing, blinkEnabled });
  }, [mouthVariant, playing, blinkEnabled]);

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

  const toggleBlink = useCallback(() => {
    const next = !blinkEnabled;
    setBlinkEnabled(next);
    loopRef.current?.updateState({ blinkEnabled: next });
  }, [blinkEnabled]);

  const cw = chibi?.width ?? 32;
  const ch = chibi?.height ?? 32;

  return (
    <div ref={containerRef} className="flex gap-2 items-start w-full">
      <canvas
        ref={(el) => { canvasRef.current = el; }}
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
          {onDownload && (
            <button
              onClick={onDownload}
              disabled={downloading}
              title="Download"
              aria-label="Download portrait"
              aria-busy={downloading}
              aria-disabled={downloading}
              className="flex-1 flex items-center justify-center bg-white/20 hover:bg-white/35 text-white/70 hover:text-white transition-colors disabled:opacity-40"
              style={{ height: cw, aspectRatio: '1' }}
            >
              {downloading ? <span className="text-[10px]">⏳</span> : <DownloadIcon />}
            </button>
          )}
        </div>
        <div className="flex" style={{ width: cw * 2 }}>
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
          <button
            onClick={toggleBlink}
            className="flex-1 flex items-center justify-center bg-white/20 hover:bg-white/35 text-white transition-colors"
            style={{ height: cw, aspectRatio: '1' }}
            title={blinkEnabled ? 'Disable blink' : 'Enable blink'}
            aria-label={blinkEnabled ? 'Disable portrait blink animation' : 'Enable portrait blink animation'}
            aria-pressed={blinkEnabled}
          >
            {blinkEnabled ? <BlinkOnIcon /> : <BlinkOffIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- FE Map Sprite ---

interface FeMapSpriteViewerProps {
  asset: Asset;
  resolvedSpec: ResolvedFeSpec;
}

interface MapSpriteRenderEntry {
  id: string;
  label: string;
  sourceKey: string;
  cutoutKey: string;
}

const WALK_RENDER_ORDER = ['left', 'right', 'up', 'down', 'cast'];

function buildMapSpriteRenderEntries(
  animations: string[],
  cutouts: Record<string, AnimationCutout>,
): MapSpriteRenderEntry[] {
  const entries: MapSpriteRenderEntry[] = [];

  for (const animation of animations) {
    const lowerAnim = animation.toLowerCase();

    if (lowerAnim === 'move' || lowerAnim === 'walk') {
      const walkKeys = WALK_RENDER_ORDER.filter((key) => cutouts[key]);
      if (walkKeys.length > 0) {
        for (const key of walkKeys) {
          entries.push({
            id: `${animation}:${key}`,
            label: key,
            sourceKey: animation,
            cutoutKey: key,
          });
        }
        continue;
      }
    }

    const fallbackCutoutKey = resolveMapSpriteCutoutKey(cutouts, animation);
    if (!fallbackCutoutKey) continue;
    entries.push({
      id: animation,
      label: animation,
      sourceKey: animation,
      cutoutKey: fallbackCutoutKey,
    });
  }

  return entries;
}

function resolveMapSpriteCutoutKey(cutouts: Record<string, AnimationCutout>, animation: string): string | null {
  const lowerAnim = animation.toLowerCase();
  if (cutouts[lowerAnim]) return lowerAnim;
  // move animation → show walk-left direction from the walk spec
  if (lowerAnim === 'move' && cutouts.left) return 'left';
  if (lowerAnim === 'move' && cutouts.walk) return 'walk';
  if (lowerAnim === 'walk' && cutouts.left) return 'left';
  return Object.keys(cutouts).find((key) => key.toLowerCase() === lowerAnim) ?? null;
}

/** Compute per-frame pixel dimensions from a cutout's bounding box + frame count. */
function getCutoutFrameDims(
  cutout: AnimationCutout,
  fallbackW: number,
  fallbackH: number,
): { w: number; h: number } {
  const isVertical = cutout.frame_direction === 'vertical';
  const frames = Math.max(1, cutout.frames ?? 1);
  if (isVertical) {
    return {
      w: cutout.width ?? fallbackW,
      h: Math.floor((cutout.height ?? fallbackH * frames) / frames),
    };
  }
  return {
    w: Math.floor((cutout.width ?? fallbackW * frames) / frames),
    h: cutout.height ?? fallbackH,
  };
}

export function FeMapSpriteViewer({ asset, resolvedSpec }: FeMapSpriteViewerProps) {
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const stopRefs = useRef<Record<string, () => void>>({});
  const [inView, setInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const animations = useMemo(
    () => [...new Set(asset.animations ?? ['stand'])],
    [asset.animations],
  );
  const cutouts = resolvedSpec.cutouts as Record<string, AnimationCutout>;
  const fw = resolvedSpec.frame_width ?? 16;
  const fh = resolvedSpec.frame_height ?? 16;
  const animationSources = useMemo(
    () => asset.animation_sources ?? {},
    [asset.animation_sources],
  );
  const renderEntries = useMemo(
    () => buildMapSpriteRenderEntries(animations, cutouts),
    [animations, cutouts],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { queueMicrotask(() => setInView(true)); return; }
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: '100px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    for (const stop of Object.values(stopRefs.current)) stop();
    stopRefs.current = {};

    if (!inView) return;

    for (const entry of renderEntries) {
      const canvas = canvasRefs.current[entry.id];
      const cutout = cutouts[entry.cutoutKey];
      const sourceUrl = animationSources[entry.sourceKey];
      if (!canvas || !cutout || !sourceUrl) continue;

      const { stop } = createFeMapSpriteLoop(canvas, sourceUrl.startsWith('/') ? sourceUrl : `/${sourceUrl}`, cutout, fw, fh);
      stopRefs.current[entry.id] = stop;
    }

    return () => {
      for (const stop of Object.values(stopRefs.current)) stop();
      stopRefs.current = {};
    };
  }, [inView, animationSources, cutouts, fw, fh, renderEntries]);

  return (
    <div ref={containerRef} className="grid w-full grid-flow-col auto-cols-fr gap-px items-start">
      {renderEntries.map((entry) => (
        (() => {
          const cutout = cutouts[entry.cutoutKey];
          const dims = cutout ? getCutoutFrameDims(cutout, fw, fh) : { w: fw, h: fh };
          return (
            <canvas
              key={entry.id}
              ref={(el) => { canvasRefs.current[entry.id] = el; }}
              width={dims.w}
              height={dims.h}
              className="w-full"
              title={entry.label}
              style={{
                imageRendering: 'pixelated',
                aspectRatio: `${dims.w} / ${dims.h}`,
                height: 'auto',
              }}
            />
          );
        })()
      ))}
    </div>
  );
}

// --- FE Battle: just display the GIF ---

export function FeBattleViewer({ asset }: { asset: Asset; resolvedSpec?: ResolvedFeSpec }) {
  const url = asset.preview
    ? (asset.preview.startsWith('/') ? asset.preview : `/${asset.preview}`)
    : '';
  if (!url) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={asset.name}
        className="w-full h-auto block object-contain object-top"
        style={{ imageRendering: 'pixelated' }}
      />
    </>
  );
}
