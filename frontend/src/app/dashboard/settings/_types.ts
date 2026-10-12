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
  couriers: string[];
  // Reasons surfaced when service_type === "Recheck" in Create Job. Admins
  // edit this list in /dashboard/settings.
  recheck_reasons: string[];
  /** Calendar days from to-lab "Date sent" to expected verbal results. */
  service_turnaround_days?: Record<string, number | null>;
  /** Stone types printed on the Precious shipment memo; others are Semi-Precious. */
  precious_stone_types?: string[];
}

export const DROPDOWN_FIELDS = ['identification', 'color', 'origin', 'comment'] as const;
