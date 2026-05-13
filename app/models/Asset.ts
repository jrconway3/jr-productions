import type { BackgroundLayer } from './Category';

export type AssetFormat = 'spritesheet' | 'gif' | 'tileset' | 'portrait';

export interface AnimationCutout {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
  frame_direction?: 'horizontal' | 'vertical';
  frame_order?: 'forward' | 'reverse';
  overlay?: string;
  offset_x?: number;
  offset_y?: number;
}

export interface AnimationSpecControls {
  type: 'portrait';
}

export interface AnimationSpecGlobalLayerAssetCondition extends Partial<AssetLayer> {
  /** LPC asset id to pull layers from (file basename under data/lpc). */
  asset: string;
  /** Optional uppercase alias supported for convenience in JSON. */
  ID?: string;
}

export interface AnimationSpecGlobalLayer extends Partial<AssetLayer> {
  /**
   * LPC asset source for this global layer:
   * - string: pull from one LPC asset id
   * - array: conditional pulls; each item can narrow by body_types or override layer fields
   */
  asset?: string | AnimationSpecGlobalLayerAssetCondition[];
  /** Optional uppercase alias supported for convenience in JSON. */
  ID?: string;
}

export interface AnimationSpec {
  id: string;
  source?: string;
  format?: string;
  frame_width?: number;
  frame_height?: number;
  fps?: number;
  frames?: number;
  cutouts?: Record<string, AnimationCutout | Record<string, AnimationCutout>>;
  /** Ordered list of directions/keys to display simultaneously */
  directions?: string[];
  /** How to arrange multiple direction canvases */
  layout?: 'row' | 'grid' | 'column';
  /** Which interactive controls to show (null = none) */
  controls?: AnimationSpecControls | null;
  /** false = never shown as a standalone per-animation card (e.g. idle, combat idle) */
  standalone?: boolean;
  /** First frame index to use (skip leading frames; walk frame 0 = standing idle) */
  start_frame?: number;
  /**
   * LPC global layer definitions.
   * - string: legacy JSON path reference under data/lpc (e.g. "body/bodies/body.json")
   * - object: optional `asset` id plus any layer fields that override pulled layer fields
   */
  global_layers?: Array<string | AnimationSpecGlobalLayer>;
  /** Resolved layers to composite beneath this animation (additive with category-level layers). */
  background_layers?: BackgroundLayer[];
  /** Group key — animations sharing a group are shown together in one card */
  group?: string;
  /** Body types that have sprite files for this animation; absent = all body types */
  body_types?: string[];
}

export type ResolvedLpcSpec = Record<string, AnimationSpec>;

export interface ResolvedFeSpec extends AnimationSpec {
  cutouts: Record<string, AnimationCutout>;
}

export interface AssetLayer {
  id: string;
  zPos: number;
  // Preferred shape: one layer id/zPos with one or more body-type-specific assets.
  assets?: Array<{
    path: string;
    body_types?: string[];
  }>;
  // Backward compatibility with older generated data.
  path?: string;
  body_types?: string[];
}

export interface AssetCredit {
  authors: string[];
  urls?: string[];
  notes?: string;
}

export interface PaletteVariant {
  id: string;
  label: string;
  swaps: Record<string, string>;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  category?: string;
  format: AssetFormat;
  tags?: string[];
  license?: string;
  credits?: AssetCredit[];
  collection?: string;
  preview?: string;
  download?: string;
  body_types?: string[];
  animations?: string[];
  variants?: string[];
  palettes?: PaletteVariant[];
  prerequisites?: { asset?: string[]; category?: string[] };
  new?: boolean;
  match_body_color?: boolean;
  recolors?: { material: string; palettes: string[] };

  // Animation spec fields
  animation_spec?: string;
  cutouts?: Record<string, Record<string, Partial<AnimationCutout>>>;

  /** Exclude this asset from gallery listings entirely */
  excluded?: boolean;

  // LPC-specific
  layers?: AssetLayer[];
  /** Background layers to composite beneath this asset (inherited from category meta at load time) */
  context_layers?: BackgroundLayer[];

  // FE-specific
  animated?: boolean;
  frames?: number;
  class?: string;
  weapon_types?: string[];
}
