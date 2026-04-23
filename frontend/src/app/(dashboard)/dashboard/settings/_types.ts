// Shared types and constants for the Settings page.

export interface DropdownOption {
  value: string;
  stone_types: string[];
}

export interface DropdownSettings {
  identification: DropdownOption[];
  color: DropdownOption[];
  origin: DropdownOption[];
  comment: DropdownOption[];
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}

export interface PricingBracket {
  min_value: number;
  max_value: number;
  fees: Record<string, number>;
}

export interface PricingConfig {
  brackets: PricingBracket[];
  color_stability_fee: number;
  mounted_jewellery_fee: number;
  service_types: string[];
  stone_types: string[];
  shapes: string[];
  payment_destinations: string[];
}

export const STONE_TYPES = [
  'all', 'Emerald', 'Sapphire', 'Ruby', 'Diamond',
  'Spinel', 'Tanzanite', 'Other',
];

export const DROPDOWN_FIELDS = ['identification', 'color', 'origin', 'comment'] as const;
