export interface CommissionEntry {
  id: string;
  name: string;
  description: string;
  applies_to?: string[];
  price_min: number | null;
  price_max: number | null;
  price_per?: string;
  price_base?: number;
  price_note?: string;
  bundle?: boolean;
  bundle_items?: string[];
  inquire: boolean;
  kofi_url: string | null;
  examples?: CommissionExampleInput[];
  status?: string;
  priority?: number;
}

export type CommissionExampleInput = string | {
    asset_id: string;
    animation?: string; body_type?: string;
    weapon?: string
};

export interface ResolvedCommissionExample {
  assetId: string;
  animation?: string;
  weapon?: string;
  bodyType?: string;
  groupAnimNames?: string[];
}

export interface CommissionSectionData {
  key: string;
  label: string;
  description?: string;
  entries: CommissionEntry[];
}

export interface CommissionCategoryData {
  key: string;
  label: string;
  description?: string;
  sections: CommissionSectionData[];
}

export interface CommissionMeta {
  status: 'open' | 'closed' | 'waitlist';
  status_note: string;
  intro?: string;
  contact_note: string;
  license_note: string;
  license_note_fe?: string;
  payment_methods: string[];
}

export interface CommissionData {
  meta: CommissionMeta;
  categories: CommissionCategoryData[];
}

export interface ResolvedCommissionData extends CommissionData {
  examplesByEntryId: Record<string, ResolvedCommissionExample>;
}
