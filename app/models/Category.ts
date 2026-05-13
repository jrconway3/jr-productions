export interface PageCreditEntry {
  label: string;
  asset_ids?: string[];
  authors?: string[];
  urls?: string[];
  license?: string;
  notes?: string;
}

export interface ResolvedPageCredit {
  label: string;
  authors: string[];
  urls: string[];
  license?: string;
  notes?: string;
}

export interface BackgroundLayer {
  id?: string;
  path: string;
  zPos: number;
  body_types?: string[];
}

export interface CategoryMeta {
  label: string;
  description: string;
  priority: number;
  accent: 'saturated' | 'warm';
  hidden?: boolean;
  /** true = exclude this category and all its assets from every gallery view */
  excluded?: boolean;
  /** false = exclude from homepage featured rotation */
  featured?: boolean;
  /** Layers to composite beneath assets in this category during preview */
  layers?: BackgroundLayer[];
  /** Credits to display at the top of the section page */
  page_credits?: PageCreditEntry[];
}

export interface Category extends CategoryMeta {
  slug: string;
  path: string;
  children: Category[];
}
