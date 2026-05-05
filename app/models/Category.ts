export interface CategoryMeta {
  label: string;
  description: string;
  priority: number;
  accent: 'saturated' | 'warm';
  hidden?: boolean;
}

export interface Category extends CategoryMeta {
  slug: string;
  path: string;
  children: Category[];
}
