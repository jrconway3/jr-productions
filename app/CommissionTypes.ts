export interface CommissionEntry {
  id: string;
  name: string;
  category: 'lpc' | 'fe';
  description: string;
  applies_to?: string[];
  price_min: number | null;
  price_max: number | null;
  price_per?: string;
  price_base?: number;
  price_note?: string;
  bundle?: boolean;
  bundle_items?: string[];
  addon: boolean;
  inquire: boolean;
  kofi_url: string | null;
  examples?: CommissionExampleInput[];
  status?: string;
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

export interface Modifier {
  id: string;
  name: string;
  description: string;
  applies_to_animations: string[];
  price_min: number;
  price_max: number;
  price_note?: string;
}

export interface CommissionMeta {
  status: 'open' | 'closed' | 'waitlist';
  status_note: string;
  contact_note: string;
  license_note: string;
  payment_methods: string[];
}

export interface CommissionData {
  meta: CommissionMeta;
  lpc_base: CommissionEntry[];
  lpc_addons: CommissionEntry[];
  fe_base: CommissionEntry[];
  fe_addons: CommissionEntry[];
}

export interface ResolvedCommissionData extends CommissionData {
  examplesByEntryId: Record<string, ResolvedCommissionExample>;
}
