import type { AnimationCutout, AnimationSpec } from './models/Asset';

export interface LayerImage {
  image: HTMLImageElement;
  zPos: number;
}

export interface FePortraitState {
  blinkFrame: number;
  mouthFrame: number;
  mouthVariant: 'mouth_smile' | 'mouth_neutral';
  playing: boolean;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
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
): { stop: () => void } {
  let rafId: number | null = null;
  let stopped = false;
  const startFrame = spec.start_frame ?? 0;
  let frameIndex = startFrame;
  let lastTime = 0;

  const fps = spec.fps ?? 8;
  const msPerFrame = 1000 / fps;
  const frames = spec.frames ?? 1;
  const directions = Object.keys(canvases);

  Promise.all(
    layerUrls.map(({ url, zPos }) =>
      loadImage(url)
        .then((image) => ({ image, zPos }))
        .catch(() => null),
    ),
  ).then((results) => {
    const layers = results.filter((r): r is LayerImage => r !== null);
    if (stopped) return;

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
  });

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
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

  if (!state.playing) return;

  const blink = cutouts['blink'];
  if (blink) {
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
  if (mouth) {
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
  const mouthFps = mouthSpec?.fps ?? 6;
  const blinkFrames = blinkSpec?.frames ?? 1;
  const mouthFrames = mouthSpec?.frames ?? 1;

  const state: FePortraitState = {
    blinkFrame: 0,
    mouthFrame: 0,
    mouthVariant,
    playing: options.playing !== false,
  };

  let blinkAccum = 0;
  let mouthAccum = 0;

  loadImage(imageUrl).then((image) => {
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
        blinkAccum += dt;
        if (blinkSpec && blinkAccum >= 1000 / blinkFps) {
          state.blinkFrame = (state.blinkFrame + 1) % blinkFrames;
          blinkAccum -= 1000 / blinkFps;
        }

        mouthAccum += dt;
        const mouthSpec2 = cutouts[state.mouthVariant];
        const mouthFps2 = mouthSpec2?.fps ?? mouthFps;
        const mouthFrames2 = mouthSpec2?.frames ?? mouthFrames;
        if (mouthSpec2 && mouthAccum >= 1000 / mouthFps2) {
          state.mouthFrame = (state.mouthFrame + 1) % mouthFrames2;
          mouthAccum -= 1000 / mouthFps2;
        }
      }

      drawFePortraitFrame(ctx!, image, cutouts, state);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  });

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
    updateState(patch) {
      Object.assign(state, patch);
      if (patch.mouthVariant) {
        state.mouthFrame = 0;
        mouthAccum = 0;
      }
    },
  };
}

// --- FE Map Sprite ---

export function createFeMapSpriteLoop(
  canvas: HTMLCanvasElement,
  imageUrl: string,
  cutout: AnimationCutout,
  frameWidth: number,
  frameHeight: number,
): { stop: () => void } {
  let rafId: number | null = null;
  let stopped = false;
  let frameIndex = 0;
  let lastTime = 0;

  const fps = cutout.fps ?? 4;
  const msPerFrame = 1000 / fps;
  const frames = cutout.frames ?? 1;
  const totalWidth = cutout.width ?? frameWidth;
  const cols = Math.max(1, Math.floor(totalWidth / frameWidth));

  function getXY(idx: number) {
    return {
      sx: (cutout.x ?? 0) + (idx % cols) * frameWidth,
      sy: (cutout.y ?? 0) + Math.floor(idx / cols) * frameHeight,
    };
  }

  loadImage(imageUrl).then((image) => {
    if (stopped) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const draw = (idx: number) => {
      const { sx, sy } = getXY(idx);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, sx, sy, frameWidth, frameHeight, 0, 0, canvas.width, canvas.height);
    };

    draw(0);

    function tick(now: number) {
      if (stopped) return;
      if (lastTime === 0) lastTime = now;
      if (now - lastTime >= msPerFrame) {
        draw(frameIndex);
        frameIndex = (frameIndex + 1) % frames;
        lastTime = now;
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  });

  return {
    stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}
