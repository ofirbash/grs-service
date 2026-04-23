// Shared type definitions for the Jobs page and its subcomponents.

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
  actual_fee?: number;
  color_stability_test?: boolean;
  mounted?: boolean;
  certificate_group?: number;
  verbal_findings?: string | StructuredVerbalFindings;
  certificate_scan_url?: string;
  // Partial-return lifecycle — only populated on new jobs
  stone_status?: 'at_office' | 'at_lab' | 'returned';
  cert_status?: 'pending' | 'delivered';
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

export interface CertificateGroup {
  groupNumber: number | null;
  stones: Stone[];
  label: string;
}

export interface Job {
  id: string;
  job_number: number;
  client_id: string;
  client_name?: string;
  branch_id: string;
  branch_name?: string;
  service_type: string;
  status: string;
  notes?: string;
  stones: Stone[];
  verbal_findings?: Array<{
    id: string;
    stone_id: string;
    identification?: string;
    color?: string;
    origin?: string;
    comment?: string;
    certificate_id?: string;
    notes?: string;
    created_at?: string;
  }>;
  notification_log?: Array<{
    id: string;
    type: string;
    recipient?: string;
    channel?: string;
    status?: string;
    sent_at: string;
    sent_by?: string;
  }>;
  total_stones: number;
  total_value: number;
  total_fee: number;
  discount?: number;
  shipment_ids?: string[];
  shipment_info?: {
    id: string;
    shipment_number: number;
    shipment_type: string;
    courier?: string;
    tracking_number?: string;
    source_address?: string;
    destination_address?: string;
    status: string;
    date_sent?: string | null;
  };
  signed_memo_url?: string;
  signed_memo_filename?: string;
  lab_invoice_url?: string;
  lab_invoice_filename?: string;
  invoice_url?: string;
  invoice_filename?: string;
  payment_status?: string;
  payment_token?: string;
  payment_url?: string;
  payments?: Array<{
    id: string;
    amount: number;
    destination?: string;
    note?: string;
    method?: string;
    recorded_at: string;
    recorded_by?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface NotificationStatus {
  type: string;
  description: string;
  status_trigger: string;
  is_available: boolean;
  is_sent: boolean;
  can_send: boolean;
  last_sent?: {
    sent_at: string;
    sent_by: string;
    status: string;
    recipient: string;
  };
}

export interface NotificationPreview {
  notification_type: string;
  description: string;
  job_number: number;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  html_body: string;
  attachments: Array<{ type: string; name: string; url: string }>;
  can_send: boolean;
  current_status: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  branch_id?: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
}
