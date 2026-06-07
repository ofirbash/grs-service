/** Shared types for the /dashboard/clients page tree. Co-located so the
 *  page and its components import from the same source. */
export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  secondary_email?: string;
  secondary_phone?: string;
  company?: string;
  address?: string;
  branch_id: string;
  notes?: string;
  user_id?: string;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
}
