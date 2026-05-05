export type AssetType = 'spritesheet' | 'gif' | 'tileset' | 'portrait';

export interface AssetCredit {
  authors: string[];
  urls: string[];
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
  category: string;
  subcategory?: string;
  type: AssetType;
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

  // LPC-specific
  layers?: string[];

  // FE-specific
  animated?: boolean;
  frames?: number;
  class?: string;
  weapon_type?: string;
}
