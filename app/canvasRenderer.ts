import type { AnimationCutout, AnimationSpec } from './models/Asset';

export interface LayerImage {
  image: HTMLImageElement;
  zPos: number;
}

export interface FePortraitState {
  blinkFrame: number;
  blinkVisible: boolean;
  mouthFrame: number;
  mouthVisible: boolean;
  mouthVariant: 'mouth_smile' | 'mouth_neutral';
  blinkEnabled: boolean;
  playing: boolean;
}

// Wraps an already-created Image in a Promise, avoiding a second fetch/decode.
function awaitImage(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (img.complete) {
    return img.naturalWidth > 0
      ? Promise.resolve(img)
      : Promise.reject(new Error(`Image failed to load: ${img.src}`));
  }
  return new Promise((resolve, reject) => {
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => reject(new Error(`Image failed to load: ${img.src}`)), { once: true });
  });
}

// LPC: cutout.width = total strip width; frameWidth = single frame width (from spec).
// Returns the top-left pixel of the frame within the source image.
function getLpcFrameXY(
  cutout: AnimationCutout,
  frameIndex: number,
  frameWidth: number,
  frameHeight: number,
  specFrames: number,
): { sx: number; sy: number } {
  const order = cutout.frame_order ?? 'forward';
  const frames = specFrames;

  let idx = order === 'reverse' ? frames - 1 - frameIndex : frameIndex;
  idx = Math.max(0, Math.min(idx, frames - 1));

  const totalWidth = cutout.width ?? frameWidth;
  const cols = Math.max(1, Math.floor(totalWidth / frameWidth));

  return {
    sx: (cutout.x ?? 0) + (idx % cols) * frameWidth,
    sy: (cutout.y ?? 0) + Math.floor(idx / cols) * frameHeight,
  };
}

// FE portrait: cutout width/height are per-frame dimensions.
function getPortraitOverlaySrcXY(
  cutout: AnimationCutout,
  frameIndex: number,
): { sx: number; sy: number } {
  const fw = cutout.width ?? 32;
  const fh = cutout.height ?? 16;
  const direction = cutout.frame_direction ?? 'horizontal';
  const order = cutout.frame_order ?? 'forward';
  const frames = cutout.frames ?? 1;

  let idx = order === 'reverse' ? frames - 1 - frameIndex : frameIndex;
  idx = Math.max(0, Math.min(idx, frames - 1));

  if (direction === 'vertical') {
    return { sx: cutout.x ?? 0, sy: (cutout.y ?? 0) + idx * fh };
  }
  return { sx: (cutout.x ?? 0) + idx * fw, sy: cutout.y ?? 0 };
}

// --- LPC single-direction draw (used by multi-direction loop) ---

export function drawLpcFrame(
  ctx: CanvasRenderingContext2D,
  layers: LayerImage[],
  spec: AnimationSpec,
  direction: string,
  frameIndex: number,
): void {
  const fw = spec.frame_width ?? 64;
  const fh = spec.frame_height ?? 64;
  const specFrames = spec.frames ?? 1;
  const cutouts = spec.cutouts as Record<string, AnimationCutout> | undefined;

  // Fall back to first available cutout key for single-direction specs (e.g. climb).
  const dirCutout = cutouts?.[direction]
    ?? (cutouts ? (Object.values(cutouts)[0] as AnimationCutout) : undefined);
  if (!dirCutout) return;

  const cutoutFrames = Math.max(1, dirCutout.frames ?? specFrames);
  const staticRows = dirCutout.fps === 0 ? cutoutFrames : 1;

  const sorted = [...layers].sort((a, b) => a.zPos - b.zPos);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let row = 0; row < staticRows; row += 1) {
    const activeFrame = staticRows > 1 ? row : frameIndex;
    const { sx, sy } = getLpcFrameXY(dirCutout, activeFrame, fw, fh, cutoutFrames);
    for (const { image } of sorted) {
      ctx.drawImage(
        image,
        sx,
        sy,
        fw,
        fh,
        0,
        row * (ctx.canvas.height / staticRows),
        ctx.canvas.width,
        ctx.canvas.height / staticRows,
      );
    }
  }
}

// --- LPC multi-direction synchronized loop ---

export function createLpcMultiDirectionLoop(
  canvases: Record<string, HTMLCanvasElement>,
  layerUrls: { url: string; zPos: number }[],
  spec: AnimationSpec,
): { stop: () => void; ready: Promise<number> } {
  let rafId: number | null = null;
  let stopped = false;
  const startFrame = spec.start_frame ?? 0;
  let frameIndex = startFrame;
  let lastTime = 0;
  let readyResolved = false;

  let resolveReady: (layerCount: number) => void = () => {};
  const ready = new Promise<number>((resolve) => {
    resolveReady = (layerCount) => {
      if (readyResolved) return;
      readyResolved = true;
      resolve(layerCount);
    };
  });

  const fps = spec.fps ?? 8;
  const msPerFrame = 1000 / fps;
  const frames = spec.frames ?? 1;
  const directions = Object.keys(canvases);

  // Create Image objects once — reused for both sync pre-draw and async animation loop.
  const probedImgs = layerUrls.map(({ url, zPos }) => {
    const img = new Image();
    img.src = url;
    return { img, zPos };
  });

  // Sync pre-draw: draw start_frame if all images are already cached; otherwise fill background.
  for (const dir of directions) {
    const ctx = canvases[dir].getContext('2d');
    if (!ctx) continue;
    const syncLayers: LayerImage[] = probedImgs
      .filter(({ img }) => img.complete && img.naturalWidth > 0)
      .map(({ img, zPos }) => ({ image: img, zPos }));
    if (syncLayers.length === probedImgs.length) {
      drawLpcFrame(ctx, syncLayers, spec, dir, startFrame);
    } else {
      // Fill with preview-surface background while images load; remains if any load fails.
      ctx.fillStyle = '#112d1f'; // .asset-preview-surface background (globals.css)
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
  }

  // Async: reuse the same Image instances to avoid a duplicate fetch/decode.
  Promise.all(
    probedImgs.map(({ img, zPos }) =>
      awaitImage(img)
        .then((image) => ({ image, zPos }))
        .catch(() => null),
    ),
  ).then((results) => {
    const layers = results.filter((r): r is LayerImage => r !== null);
    resolveReady(layers.length);
    if (stopped) return;
    if (layers.length === 0) return;

    // Draw start_frame immediately so there's no blank flash before the loop starts.
    for (const dir of directions) {
      const ctx = canvases[dir].getContext('2d');
      if (ctx) drawLpcFrame(ctx, layers, spec, dir, startFrame);
    }

    function tick(now: number) {
      if (stopped) return;
      if (lastTime === 0) lastTime = now;

      if (now - lastTime >= msPerFrame) {
        for (const dir of directions) {
          const ctx = canvases[dir].getContext('2d');
          if (ctx) drawLpcFrame(ctx, layers, spec, dir, frameIndex);
        }
        frameIndex = frameIndex + 1 >= frames ? startFrame : frameIndex + 1;
        lastTime = now;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }).catch(() => {
    resolveReady(0);
  });

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
    ready,
  };
}

// --- FE Portrait ---

export function drawFePortraitFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cutouts: Record<string, AnimationCutout>,
  state: FePortraitState,
): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const portrait = cutouts['portrait'];
  if (!portrait) return;

  const scale = ctx.canvas.width / (portrait.width ?? 96);

  ctx.drawImage(
    image,
    portrait.x ?? 0, portrait.y ?? 0, portrait.width ?? 96, portrait.height ?? 80,
    0, 0, ctx.canvas.width, ctx.canvas.height,
  );

  const blink = cutouts['blink'];
  if (state.playing && state.blinkEnabled && state.blinkVisible && blink) {
    const fw = blink.width ?? 32;
    const fh = blink.height ?? 16;
    const { sx, sy } = getPortraitOverlaySrcXY(blink, state.blinkFrame);
    ctx.drawImage(
      image, sx, sy, fw, fh,
      (blink.offset_x ?? 0) * scale, (blink.offset_y ?? 0) * scale,
      fw * scale, fh * scale,
    );
  }

  const mouth = cutouts[state.mouthVariant];
  if (state.playing && state.mouthVisible && mouth) {
    const fw = mouth.width ?? 32;
    const fh = mouth.height ?? 16;
    const { sx, sy } = getPortraitOverlaySrcXY(mouth, state.mouthFrame);
    ctx.drawImage(
      image, sx, sy, fw, fh,
      (mouth.offset_x ?? 0) * scale, (mouth.offset_y ?? 0) * scale,
      fw * scale, fh * scale,
    );
  }
}

export interface FePortraitLoopOptions {
  mouthVariant?: 'mouth_smile' | 'mouth_neutral';
  blinkEnabled?: boolean;
  playing?: boolean;
}

export function createFePortraitLoop(
  canvas: HTMLCanvasElement,
  imageUrl: string,
  cutouts: Record<string, AnimationCutout>,
  options: FePortraitLoopOptions = {},
): { stop: () => void; updateState: (patch: Partial<FePortraitState>) => void } {
  let rafId: number | null = null;
  let stopped = false;
  let lastTime = 0;

  const blinkSpec = cutouts['blink'];
  const mouthVariant = options.mouthVariant ?? 'mouth_neutral';
  const mouthSpec = cutouts[mouthVariant];

  const blinkFps = blinkSpec?.fps ?? 8;
  const blinkFrames = blinkSpec?.frames ?? 1;
  const mouthFps = mouthSpec?.fps ?? 6;
  const mouthFrames = mouthSpec?.frames ?? 1;

  const HIDE_OVERLAY = -1;

  const buildOverlaySequence = (cutout: AnimationCutout | undefined, totalFrames: number): number[] => {
    if (!cutout) return [HIDE_OVERLAY];
    const rawSequence = cutout.frame_sequence ?? [];
    if (rawSequence.length > 0) {
      const sequence = rawSequence
        .map((n) => {
          const parsed = Math.floor(n);
          if (!Number.isFinite(parsed)) return undefined;
          // 0 is a special sentinel: hide overlay for this step.
          if (parsed === 0) return HIDE_OVERLAY;
          // Positive values are one-based frame numbers.
          const idx = parsed - 1;
          if (idx < 0 || idx >= totalFrames) return undefined;
          return idx;
        })
        .filter((idx): idx is number => idx !== undefined);
      if (sequence.length > 0) return sequence;
    }

    if (cutout.frame_order === 'reverse') {
      return Array.from({ length: totalFrames }, (_, idx) => totalFrames - 1 - idx);
    }
    return Array.from({ length: totalFrames }, (_, idx) => idx);
  };

  const blinkSequence = buildOverlaySequence(blinkSpec, blinkFrames);
  let blinkSequenceIndex = 0;
  const blinkStepMs = 1000 / blinkFps;
  let blinkAccum = 0;

  const getMouthSpec = (variant: 'mouth_smile' | 'mouth_neutral') => cutouts[variant];
  let activeMouthSpec = getMouthSpec(mouthVariant);
  let activeMouthFrames = activeMouthSpec?.frames ?? mouthFrames;
  let activeMouthFps = activeMouthSpec?.fps ?? mouthFps;
  let mouthSequence = buildOverlaySequence(activeMouthSpec, activeMouthFrames);
  let mouthSequenceIndex = 0;
  let mouthAccum = 0;

  const state: FePortraitState = {
    blinkFrame: blinkSequence[0] === HIDE_OVERLAY ? 0 : (blinkSequence[0] ?? 0),
    blinkVisible: blinkSequence[0] !== HIDE_OVERLAY,
    mouthFrame: mouthSequence[0] === HIDE_OVERLAY ? 0 : (mouthSequence[0] ?? 0),
    mouthVisible: mouthSequence[0] !== HIDE_OVERLAY,
    mouthVariant,
    blinkEnabled: options.blinkEnabled !== false,
    playing: options.playing !== false,
  };

  // Create Image once — reused for both sync pre-draw and async animation loop.
  const portraitImg = new Image();
  portraitImg.src = imageUrl;
  if (portraitImg.complete && portraitImg.naturalWidth > 0) {
    const ctx = canvas.getContext('2d');
    if (ctx) drawFePortraitFrame(ctx, portraitImg, cutouts, state);
  } else {
    const ctx = canvas.getContext('2d');
    // Fill with preview-surface background while the image loads; remains if the image fails to load.
    if (ctx) { ctx.fillStyle = '#112d1f'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  awaitImage(portraitImg).then((image) => {
    if (stopped) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawFePortraitFrame(ctx, image, cutouts, state);

    function tick(now: number) {
      if (stopped) return;
      if (lastTime === 0) lastTime = now;
      const dt = now - lastTime;
      lastTime = now;

      if (state.playing) {
        if (blinkSpec && state.blinkEnabled) {
          blinkAccum += dt;
          if (blinkAccum >= blinkStepMs) {
            blinkAccum = 0;
            blinkSequenceIndex = (blinkSequenceIndex + 1) % Math.max(1, blinkSequence.length);
            const step = blinkSequence[blinkSequenceIndex] ?? HIDE_OVERLAY;
            state.blinkVisible = step !== HIDE_OVERLAY;
            if (state.blinkVisible) state.blinkFrame = step;
          }
        } else {
          state.blinkVisible = false;
          blinkAccum = 0;
          blinkSequenceIndex = 0;
        }

        if (activeMouthSpec) {
          const mouthStepMs = 1000 / Math.max(1, activeMouthFps);
          mouthAccum += dt;
          if (mouthAccum >= mouthStepMs) {
            mouthAccum = 0;
            mouthSequenceIndex = (mouthSequenceIndex + 1) % Math.max(1, mouthSequence.length);
            const step = mouthSequence[mouthSequenceIndex] ?? HIDE_OVERLAY;
            state.mouthVisible = step !== HIDE_OVERLAY;
            if (state.mouthVisible) state.mouthFrame = step;
          }
        } else {
          state.mouthVisible = false;
        }
      }

      drawFePortraitFrame(ctx!, image, cutouts, state);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }).catch(() => {
    // Image failed to load; canvas remains blank.
  });

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
    updateState(patch) {
      Object.assign(state, patch);
      if (patch.mouthVariant) {
        activeMouthSpec = getMouthSpec(patch.mouthVariant);
        activeMouthFrames = activeMouthSpec?.frames ?? mouthFrames;
        activeMouthFps = activeMouthSpec?.fps ?? mouthFps;
        mouthSequence = buildOverlaySequence(activeMouthSpec, activeMouthFrames);
        mouthSequenceIndex = 0;
        state.mouthVisible = (mouthSequence[0] ?? HIDE_OVERLAY) !== HIDE_OVERLAY;
        if (state.mouthVisible) state.mouthFrame = mouthSequence[0] ?? 0;
        mouthAccum = 0;
      }
      if (patch.blinkEnabled === false) {
        state.blinkVisible = false;
        blinkAccum = 0;
        blinkSequenceIndex = 0;
      }
      if (patch.blinkEnabled === true) {
        blinkSequenceIndex = 0;
        state.blinkVisible = (blinkSequence[0] ?? HIDE_OVERLAY) !== HIDE_OVERLAY;
        if (state.blinkVisible) state.blinkFrame = blinkSequence[0] ?? 0;
        blinkAccum = 0;
      }
    },
  };
}

// --- FE Map Sprite ---

export function createFeMapSpriteLoop(
  canvas: HTMLCanvasElement,
  imageUrl: string,
  cutout: AnimationCutout,
  fallbackFW = 16,
  fallbackFH = 16,
): { stop: () => void } {
  let rafId: number | null = null;
  let stopped = false;
  let sequenceIndex = 0;
  let lastTime = 0;

  const fps = cutout.fps ?? 4;
  const msPerFrame = 1000 / fps;
  const frames = cutout.frames ?? 1;
  const isVertical = cutout.frame_direction === 'vertical';
  const flip = cutout.flip === 'horizontal';

  // Derive per-frame pixel dimensions from the cutout bounding box.
  // For vertical strips: height is total strip height, divide by frames to get per-frame height.
  // For horizontal strips: width is total strip width, divide by frames.
  const perFrameW = isVertical
    ? (cutout.width ?? fallbackFW)
    : Math.floor((cutout.width ?? fallbackFW * frames) / frames);
  const perFrameH = isVertical
    ? Math.floor((cutout.height ?? fallbackFH * frames) / frames)
    : (cutout.height ?? fallbackFH);

  const rawSequence = cutout.frame_sequence ?? [];
  const hasZero = rawSequence.some((n) => n === 0);
  const frameSequence = rawSequence.length > 0
    ? rawSequence
      .map((n) => {
        const parsed = Math.floor(n);
        if (!Number.isFinite(parsed)) return null;
        // If the sequence contains 0, treat values as zero-based.
        // Otherwise, allow one-based authoring (e.g. [1,2,3,2]).
        const idx = hasZero ? parsed : parsed - 1;
        if (idx < 0 || idx >= frames) return null;
        return idx;
      })
      .filter((idx): idx is number => idx !== null)
    : cutout.frame_order === 'reverse'
      ? Array.from({ length: frames }, (_, idx) => frames - 1 - idx)
      : Array.from({ length: frames }, (_, idx) => idx);

  function getXY(idx: number): { sx: number; sy: number } {
    if (isVertical) {
      return { sx: cutout.x ?? 0, sy: (cutout.y ?? 0) + idx * perFrameH };
    }
    return { sx: (cutout.x ?? 0) + idx * perFrameW, sy: cutout.y ?? 0 };
  }

  // Create Image once — reused for both sync pre-draw and async animation loop.
  const mapImg = new Image();
  mapImg.src = imageUrl;
  if (mapImg.complete && mapImg.naturalWidth > 0) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const { sx, sy } = getXY(frameSequence[0] ?? 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (flip) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(mapImg, sx, sy, perFrameW, perFrameH, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(mapImg, sx, sy, perFrameW, perFrameH, 0, 0, canvas.width, canvas.height);
      }
    }
  } else {
    const ctx = canvas.getContext('2d');
    // Fill with preview-surface background while the image loads; remains if the image fails to load.
    if (ctx) { ctx.fillStyle = '#112d1f'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  // Async: reuse the same Image instance to avoid a duplicate fetch/decode.
  awaitImage(mapImg).then((image) => {
    if (stopped) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const draw = (idx: number) => {
      const { sx, sy } = getXY(idx);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (flip) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(image, sx, sy, perFrameW, perFrameH, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(image, sx, sy, perFrameW, perFrameH, 0, 0, canvas.width, canvas.height);
      }
    };

    draw(frameSequence[0] ?? 0);
    sequenceIndex = frameSequence.length > 1 ? 1 : 0;

    function tick(now: number) {
      if (stopped) return;
      if (lastTime === 0) lastTime = now;
      if (now - lastTime >= msPerFrame) {
        draw(frameSequence[sequenceIndex] ?? 0);
        sequenceIndex = (sequenceIndex + 1) % Math.max(1, frameSequence.length);
        lastTime = now;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }).catch(() => {
    // Image failed to load; canvas retains background fill.
  });

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}
