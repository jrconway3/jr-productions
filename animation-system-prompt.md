# Task: Implement the Animation Spec System for jaidynreiman.net

## What to Build

Implement the animation spec system as defined in the reference doc. This covers:

1. **Create `/data/animations/` directory structure** with spec files for LPC and FE
2. **Update existing asset JSONs** to reference `animation_spec` and add `cutouts` overrides where needed
3. **Build the canvas-based asset viewer** that reads specs and renders animations

---

## Directory Structure to Create

```
/data/animations/
  /lpc/
    walk.json
    slash.json
    thrust.json
    spellcast.json
    shoot.json
    hurt.json
    idle.json
    run.json
    jump.json
    combat.json
    climb.json
    watering.json
    sit.json
    emote.json
  /fe/
    portrait.json
    map_sprite.json
    battle.json
```

---

## Spec File Format

### LPC Animation Spec (animated)

```json
{
  "id": "walk",
  "frame_width": 64,
  "frame_height": 64,
  "fps": 8,
  "frames": 9,
  "cutouts": {
    "up":    { "x": 0, "y": 0,   "width": 576, "height": 64 },
    "left":  { "x": 0, "y": 64,  "width": 576, "height": 64 },
    "down":  { "x": 0, "y": 128, "width": 576, "height": 64 },
    "right": { "x": 0, "y": 192, "width": 576, "height": 64 }
  }
}
```

### LPC Static Spec (sit/emote — no animation, 3 poses × 4 directions)

```json
{
  "id": "sit",
  "frame_width": 64,
  "frame_height": 64,
  "cutouts": {
    "up":    { "x": 0, "y": 0,   "width": 192, "height": 64 },
    "left":  { "x": 0, "y": 64,  "width": 192, "height": 64 },
    "down":  { "x": 0, "y": 128, "width": 192, "height": 64 },
    "right": { "x": 0, "y": 192, "width": 192, "height": 64 }
  }
}
```

### FE Portrait Spec

Portrait sheet is 128×112 total. Dimensions and coordinates are standardized across all portraits.

```json
{
  "id": "fe_portrait",
  "cutouts": {
    "portrait": {
      "x": 0, "y": 0, "width": 96, "height": 80
    },
    "chibi": {
      "x": 96, "y": 16, "width": 32, "height": 32
    },
    "blink": {
      "x": 96, "y": 48, "width": 32, "height": 16,
      "frames": 2, "fps": 8,
      "frame_direction": "vertical",
      "overlay": "portrait", "offset_x": 0, "offset_y": 0
    },
    "mouth_smile": {
      "x": 0, "y": 80, "width": 32, "height": 16,
      "frames": 3, "fps": 6,
      "frame_order": "reverse",
      "overlay": "portrait", "offset_x": 0, "offset_y": 0
    },
    "mouth_neutral": {
      "x": 0, "y": 96, "width": 32, "height": 16,
      "frames": 3, "fps": 6,
      "frame_order": "reverse",
      "overlay": "portrait", "offset_x": 0, "offset_y": 0
    }
  }
}
```

**Key details:**
- `chibi` has no `overlay` — standalone, displayed separately on page
- `mouth_smile` and `mouth_neutral` are interchangeable mouth variants
- `blink` frames are stacked **vertically** (top-to-bottom), not side-by-side
- `mouth_smile` and `mouth_neutral` frames play in **reverse** order
- Cutouts with `overlay` composite over the named base cutout
- Default overlay target is the first cutout entry if `overlay` is omitted
- Per-portrait `offset_x`/`offset_y` overrides are set case-by-case in individual asset JSONs

### New Spec-Level Fields

| Field | Values | Default | Purpose |
|---|---|---|---|
| `frame_direction` | `"horizontal"`, `"vertical"` | `"horizontal"` | Direction frames are laid out in the sheet |
| `frame_order` | `"forward"`, `"reverse"` | `"forward"` | Playback order of frames |

Both fields can also be overridden per-asset via `cutouts` if a specific asset differs from the spec.

---

## Asset JSON Changes

Add `animation_spec` and `cutouts` fields to existing asset JSONs:

### LPC assets

```json
{
  "animation_spec": "lpc",
  "animations": ["walk", "slash", "hurt"],
  "cutouts": {
    "walk": {
      "right": { "x": 0, "y": 256, "width": 576, "height": 64 }
    }
  }
}
```

- `cutouts` only needed when a direction deviates from the spec default
- `animations` lists which LPC animation specs apply to this asset

### FE portrait assets

```json
{
  "animation_spec": "fe/portrait",
  "cutouts": {
    "mouth_neutral": { "offset_x": 12, "offset_y": 40 },
    "mouth_smile":   { "offset_x": 12, "offset_y": 40 },
    "blink":         { "offset_x": 18, "offset_y": 24 }
  }
}
```

- Only override `offset_x`/`offset_y` when they differ from spec defaults
- Offsets are per-portrait and must be measured/set case by case
- For now, set offsets to `0, 0` as placeholders — they will be tuned per portrait later

### FE map sprite assets

```json
{
  "animation_spec": "fe/map_sprite",
  "animations": ["stand", "walk"]
}
```

### FE battle animation assets

```json
{
  "animation_spec": "fe/battle"
}
```

---

## Canvas Renderer

Build a canvas-based viewer component that:

1. **LPC assets** — loads the spritesheet, reads the animation spec for each listed animation, renders the correct frame cutout on canvas, cycles through frames at the specified fps. Supports direction switching (up/left/down/right). Applies asset-level cutout overrides where present.

2. **FE portraits** — loads the portrait sheet, renders the base portrait cutout, composites animated mouth and blink frames over it at the correct offsets. Toggleable animation (on/off). Chibi cutout rendered separately alongside. Supports both `mouth_neutral` and `mouth_smile` variants with a toggle.

3. **FE map sprites** — loads stand and walk files, renders stand pose by default, switches to walk animation on hover or toggle. Verify actual map sprite file structure and frame dimensions before implementing.

4. **FE battle animations** — GIF only, no canvas manipulation needed.

### Important constraints

- All canvas logic lives in `/app` services, not in components
- Components receive pre-resolved spec data as props
- The renderer must handle missing cutout overrides gracefully — fall back to spec defaults
- `sit` and `emote` display all poses as a static sheet rather than animating
- `frame_direction` and `frame_order` must be respected during frame iteration

---

## AnimationService

Add `AnimationService.js` to `/app`:

- Loads spec files from `/data/animations/`
- Resolves asset `animation_spec` reference to the correct spec file (`"lpc"` → `/data/animations/lpc/`, `"fe/portrait"` → `/data/animations/fe/portrait.json`)
- Merges asset-level `cutouts` overrides into spec defaults
- Returns resolved spec ready for the canvas renderer

---

## Notes

- LPC frame dimensions are universally 64×64 — no exceptions in current catalog
- FE portrait sheet dimensions are standardized at 128×112 total — coordinates in the spec above are correct
- FE map sprite frame dimensions need verification from actual asset files before hardcoding spec values