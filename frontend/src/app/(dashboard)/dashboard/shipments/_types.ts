// Shared types for the Shipments page.

export interface Shipment {
  id: string;
  shipment_number: number;
  shipment_type: string;
  courier: string;
  source_address: string;
  destination_address: string;
  tracking_number?: string;
  status: string;
  job_ids: string[];
  total_jobs: number;
  total_stones: number;
  total_value: number;
  notes?: string;
  created_by: string;
  created_at: string;
}

export interface StructuredVerbalFindings {
  certificate_id?: string;
  weight?: number;
  identification?: string;
  color?: string;
  origin?: string;
  comment?: string;
}

export interface Stone {
  id: string;
  sku: string;
  stone_type: string;
  weight: number;
  shape: string;
  value: number;
  fee: number;
  certificate_group?: number;
  verbal_findings?: string | StructuredVerbalFindings;
  certificate_scan_url?: string;
}

export interface Job {
  id: string;
  job_number: number;
  client_name?: string;
  branch_name?: string;
  service_type?: string;
  status: string;
  notes?: string;
  total_stones: number;
  total_value: number;
  total_fee: number;
  shipment_ids?: string[];
  stones?: Array<Stone>;
  signed_memo_url?: string;
}

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

export interface ShipmentOptions {
  shipment_types: string[];
  couriers: string[];
  statuses: string[];
  address_options: string[];
}
