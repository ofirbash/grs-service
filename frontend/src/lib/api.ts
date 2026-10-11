import axios from 'axios';
import { getToken, clearToken } from './tokenStorage';
import { useAuthStore } from './store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle auth errors.
// On an expired/missing-token failure we kick the user back to /login —
// but ONLY when the failure represents a session problem, never when the
// login attempt itself is what failed (otherwise a wrong-password attempt
// would trigger a full page reload that wipes the inline error message
// before the user can read it).
//
// We catch BOTH:
//   - 401 Unauthorized (issued by backend's JWTBearer for missing/expired
//     tokens and by routes/auth_routes.py for invalid token / user not found)
//   - 403 Forbidden when the detail string indicates an auth problem
//     (defensive — covers any middleware path that might still emit 403
//     for a missing Authorization header instead of 401)
//
// Legitimate role-based 403s (e.g. "Admin access required" when a customer
// hits an admin endpoint) are left alone so the calling page can show its
// own error.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window === 'undefined') return Promise.reject(error);

    const status: number | undefined = error.response?.status;
    const detail: string = error.response?.data?.detail || '';
    const requestUrl: string = error.config?.url || '';
    const isAuthEndpoint =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/forgot-password') ||
      requestUrl.includes('/auth/setup-password') ||
      requestUrl.includes('/auth/setup-info') ||
      requestUrl.includes('/access-requests/send-otp') ||
      requestUrl.includes('/access-requests/verify-and-submit');
    const onLoginPage = window.location.pathname.startsWith('/login');

    const looksLikeMissingAuth =
      status === 401 ||
      (status === 403 &&
        /not authenticated|invalid authentication|missing|token/i.test(detail));

    if (looksLikeMissingAuth && !isAuthEndpoint && !onLoginPage) {
      // Clear BOTH layers of auth state.
      //
      // - `clearToken()` wipes the raw `'token'` key from sessionStorage
      //   (used by the request interceptor's `getToken()`).
      // - `useAuthStore.getState().logout()` resets the in-memory zustand
      //   store AND its persisted `'auth-storage'` copy in sessionStorage —
      //   which is what `DashboardLayout` reads from to decide whether to
      //   redirect to `/login`. Forgetting this step leaves the dashboard
      //   thinking the user is still authenticated after a full page
      //   reload, so the layout skips the auth-gate redirect and the user
      //   ends up staring at an empty dashboard with `/login?reason=expired`
      //   in the URL bar (reported by an admin Feb 25 2026).
      clearToken();
      try {
        useAuthStore.getState().logout();
      } catch {
        // Defensive: if zustand isn't initialised for any reason, fall back
        // to a raw sessionStorage wipe so the rehydrate-on-reload step
        // can't restore stale `isAuthenticated: true`.
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('auth-storage');
        }
      }
      // `replace`, not `href = ...`, so we don't leave the protected route
      // sitting in browser history (back-button trap). Tells the login page
      // to show the "session expired" banner.
      //
      // Trailing slash is mandatory — `next.config.mjs` sets
      // `trailingSlash: true` which writes the page as `/login/index.html`.
      // Without the slash, the production proxy 301s `/login?...` → an
      // absolute `http://lab.bashari.co:8080/login/?...` (the proxy leaks
      // its internal listen port + protocol into the Location header),
      // which the browser refuses with "site can't provide a secure
      // connection". Emitting the slash up-front sidesteps the broken
      // redirect entirely on prod, and is a no-op on preview/local.
      window.location.replace('/login/?reason=expired');
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (
    email: string,
    password: string,
    extras?: { turnstile_token?: string; website?: string; totp_code?: string }
  ) => {
    const response = await api.post('/auth/login', {
      email,
      password,
      ...(extras || {}),
    });
    return response.data;
  },
  register: async (data: { email: string; password: string; full_name: string; role?: string }) => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  setupPassword: async (
    token: string,
    password: string,
    profile?: { phone?: string; company?: string; address?: string }
  ) => {
    const response = await api.post('/auth/setup-password', {
      token,
      password,
      ...(profile || {}),
    });
    return response.data;
  },
  getSetupInfo: async (token: string) => {
    const response = await api.get('/auth/setup-info', { params: { token } });
    return response.data as {
      email: string;
      full_name: string;
      phone: string;
      company: string;
      address: string;
    };
  },
  updateProfile: async (data: { full_name?: string; phone?: string; email?: string; password?: string }) => {
    const response = await api.put('/auth/me', data);
    return response.data;
  },
  forgotPassword: async (email: string) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },
  adminResetPassword: async (userId: string) => {
    const response = await api.post(`/auth/admin-reset-password/${userId}`);
    return response.data;
  },
  setup2fa: async () => {
    const response = await api.post('/auth/setup-2fa');
    return response.data as {
      secret: string;
      qr_code: string;
      provisioning_uri: string;
    };
  },
  enable2fa: async (secret: string, totp_code: string) => {
    const response = await api.post('/auth/enable-2fa', { secret, totp_code });
    return response.data;
  },
  disable2fa: async (password: string, totp_code: string) => {
    const response = await api.post('/auth/disable-2fa', { password, totp_code });
    return response.data;
  },
};

// Access Request API (public landing page signup)
export const accessRequestApi = {
  sendOtp: async (data: {
    full_name: string;
    company: string;
    email: string;
    phone: string;
    turnstile_token?: string;
    website?: string;
  }) => {
    const response = await api.post('/access-requests/send-otp', data);
    return response.data;
  },
  verifyAndSubmit: async (data: {
    email: string;
    otp: string;
    full_name: string;
    company: string;
    phone: string;
    turnstile_token?: string;
    website?: string;
  }) => {
    const response = await api.post('/access-requests/verify-and-submit', data);
    return response.data;
  },
  list: async (status?: 'pending' | 'approved' | 'rejected') => {
    const response = await api.get('/access-requests', { params: status ? { status } : {} });
    return response.data as Array<{
      id: string;
      full_name: string;
      company: string;
      email: string;
      phone: string;
      status: string;
      submitted_at: string;
      reviewed_at: string | null;
      reviewed_by: string | null;
      reject_reason: string | null;
      client_id: string | null;
    }>;
  },
  pendingCount: async (): Promise<number> => {
    // Lightweight endpoint specifically for the sidebar/tab badge — returns
    // just the count, not the full row payload.
    const response = await api.get('/access-requests/pending-count');
    return (response.data?.count as number) || 0;
  },
  approve: async (id: string) => {
    const response = await api.post(`/access-requests/${id}/approve`);
    return response.data;
  },
  reject: async (id: string, reason: string) => {
    const response = await api.post(`/access-requests/${id}/reject`, { reason });
    return response.data;
  },
};

// Users API (admin management)
export const usersApi = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
  },
  createAdmin: async (data: { email: string; full_name: string; password: string; role: string; branch_id?: string; phone?: string }) => {
    const response = await api.post('/users/admin', data);
    return response.data;
  },
  /** Create a `signing_pad` kiosk account. Super-admin only on the backend. */
  createSigningPad: async (data: { email: string; full_name: string; password: string; branch_id?: string | null }) => {
    const response = await api.post('/users/signing-pad', data);
    return response.data;
  },
  update: async (id: string, data: { full_name?: string; role?: string; branch_id?: string; phone?: string; password?: string }) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },
};

// Shipments API
export const shipmentsApi = {
  getAll: async (params?: { status?: string; courier?: string; branch_id?: string; include_archived?: boolean }) => {
    const response = await api.get('/shipments', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/shipments/${id}`);
    return response.data;
  },
  create: async (data: {
    shipment_type: string;
    courier: string;
    source_address: string;
    destination_address: string;
    tracking_number?: string;
    date_sent?: string;
    job_ids?: string[];
    stone_ids?: string[];
    notes?: string;
  }) => {
    const response = await api.post('/shipments', data);
    return response.data;
  },
  update: async (id: string, data: Partial<{
    shipment_type: string;
    courier: string;
    source_address: string;
    destination_address: string;
    tracking_number: string;
    date_sent: string;
    status: string;
    notes: string;
  }>) => {
    const response = await api.put(`/shipments/${id}`, data);
    return response.data;
  },
  updateStatus: async (id: string, status: string, cascade_to_jobs: boolean = true) => {
    const response = await api.put(`/shipments/${id}/status`, { status, cascade_to_jobs });
    return response.data;
  },
  updateJobs: async (id: string, job_ids: string[]) => {
    const response = await api.put(`/shipments/${id}/jobs`, { job_ids });
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/shipments/${id}`);
    return response.data;
  },
  getOptions: async () => {
    const response = await api.get('/shipments/config/options');
    return response.data;
  },
};

// Jobs API
export const jobsApi = {
  getAll: async (params?: { branch_id?: string; client_id?: string; status?: string }) => {
    const response = await api.get('/jobs', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/jobs/${id}`);
    return response.data;
  },
  create: async (data: {
    client_id: string;
    branch_id: string;
    service_type: string;
    notes?: string;
    recheck_reasons?: string[];
    certificate_units: Array<{ stones: Array<{ stone_type: string; weight: number; shape: string; value: number; color_stability_test?: boolean; is_parcel?: boolean; stone_count?: number; mounted?: boolean; customer_sku?: string }> }>;
  }) => {
    const response = await api.post('/jobs', data);
    return response.data;
  },
  updateStatus: async (id: string, status: string) => {
    const response = await api.put(`/jobs/${id}/status`, { status });
    return response.data;
  },
  groupStones: async (id: string, stone_ids: string[], group_number: number) => {
    const response = await api.put(`/jobs/${id}/group-stones`, { stone_ids, group_number });
    return response.data;
  },
  ungroupStones: async (id: string, stone_ids: string[]) => {
    const response = await api.put(`/jobs/${id}/ungroup-stones`, { stone_ids });
    return response.data;
  },
  uploadMemo: async (id: string, filename: string, file_data: string) => {
    const response = await api.put(`/jobs/${id}/memo`, { filename, file_data });
    return response.data;
  },
  uploadLabInvoice: async (id: string, filename: string, file_data: string) => {
    const response = await api.put(`/jobs/${id}/lab-invoice`, { filename, file_data });
    return response.data;
  },
  generateInvoice: async (id: string) => {
    const response = await api.post(`/jobs/${id}/generate-invoice`);
    return response.data;
  },
  generatePaymentToken: async (id: string, data?: { is_adjustment?: boolean; adjustment_amount?: number }) => {
    const response = await api.post(`/jobs/${id}/payment-token`, data || {});
    return response.data;
  },
  update: async (id: string, data: { notes?: string; status?: string; discount?: number }) => {
    const response = await api.put(`/jobs/${id}`, data);
    return response.data;
  },
  addStone: async (id: string, stone: {
    stone_type: string;
    weight: number;
    shape?: string;
    value: number;
    color_stability_test?: boolean;
    is_parcel?: boolean;
    stone_count?: number;
    mounted?: boolean;
    customer_sku?: string;
  }) => {
    const response = await api.post(`/jobs/${id}/stones`, stone);
    return response.data;
  },
  deleteStone: async (jobId: string, stoneId: string) => {
    const response = await api.delete(`/jobs/${jobId}/stones/${stoneId}`);
    return response.data;
  },
};

// Stones API
export const stonesApi = {
  getAll: async (params?: { branch_id?: string }) => {
    const response = await api.get('/stones', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/stones/${id}`);
    return response.data;
  },
  updateVerbal: async (id: string, verbal_findings: string) => {
    const response = await api.put(`/stones/${id}/verbal`, { verbal_findings });
    return response.data;
  },
  updateStructuredVerbal: async (id: string, structured_findings: {
    certificate_id?: string;
    weight?: number;
    identification?: string;
    color?: string;
    origin?: string;
    comment?: string;
    // Parcels: per-stone findings sharing one cert ID. The backend
    // `StructuredVerbalFindings` model accepts this list of dicts.
    per_stone?: Array<{
      weight?: number;
      identification?: string;
      color?: string;
      origin?: string;
      comment?: string;
    }>;
  }) => {
    const response = await api.put(`/stones/${id}/verbal`, { structured_findings });
    return response.data;
  },
  updateFees: async (id: string, data: { actual_fee?: number; color_stability_test?: boolean; mounted?: boolean }) => {
    const response = await api.put(`/stones/${id}/fees`, data);
    return response.data;
  },
  updateDetails: async (
    id: string,
    data: {
      stone_type?: string;
      weight?: number;
      shape?: string;
      value?: number;
      color_stability_test?: boolean;
      mounted?: boolean;
      kind?: 'stone' | 'parcel';
      stone_count?: number;
      /** Optional customer-supplied second identifier. Pass an empty
       *  string to clear a previously-set value; omit to leave untouched. */
      customer_sku?: string;
    },
  ) => {
    // PUT /stones/{id} — patches any subset of details and recomputes
    // fee from the parent job's service_type bracket table.
    const response = await api.put(`/stones/${id}`, data);
    return response.data as {
      stone: unknown;
      new_fee: number;
      job_total_fee: number;
    };
  },
  uploadCertificateScan: async (id: string, filename: string, file_data: string) => {
    const response = await api.put(`/stones/${id}/certificate-scan`, { filename, file_data });
    return response.data;
  },
  uploadGroupCertificateScan: async (job_id: string, certificate_group: number, filename: string, file_data: string) => {
    const response = await api.put('/stones/group/certificate-scan', { job_id, certificate_group, filename, file_data });
    return response.data;
  },
  cancel: async (id: string) => {
    // Backend treats this as a hard delete now (the PATCH route is kept
    // for backwards-compat). Frontend label is "Delete" but the call name
    // stays `cancel` to avoid a churn of test-ids across the app.
    const response = await api.patch(`/stones/${id}/cancel`);
    return response.data;
  },
};

// Clients API
export const clientsApi = {
  getAll: async (branch_id?: string) => {
    const response = await api.get('/clients', { params: { branch_id } });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/clients/${id}`);
    return response.data;
  },
  create: async (data: {
    name: string;
    email: string;
    phone?: string;
    secondary_email?: string;
    secondary_phone?: string;
    company?: string;
    address?: string;
    branch_id: string;
    notes?: string;
  }) => {
    const response = await api.post('/clients', data);
    return response.data;
  },
  update: async (id: string, data: {
    name?: string;
    email?: string;
    phone?: string;
    secondary_email?: string;
    secondary_phone?: string;
    company?: string;
    address?: string;
    branch_id?: string;
    notes?: string;
  }) => {
    const response = await api.put(`/clients/${id}`, data);
    return response.data;
  },
  remove: async (id: string) => {
    const response = await api.delete(`/clients/${id}`);
    return response.data;
  },
};

// Branches API
export const branchesApi = {
  getAll: async () => {
    const response = await api.get('/branches');
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/branches/${id}`);
    return response.data;
  },
  create: async (data: {
    name: string;
    code: string;
    address: string;
    phone?: string;
    email?: string;
  }) => {
    const response = await api.post('/branches', data);
    return response.data;
  },
  update: async (id: string, data: {
    name?: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
  }) => {
    const response = await api.put(`/branches/${id}`, data);
    return response.data;
  },
  remove: async (id: string) => {
    const response = await api.delete(`/branches/${id}`);
    return response.data;
  },
};

// Settings API
export const settingsApi = {
  getDropdowns: async () => {
    const response = await api.get('/settings/dropdowns');
    return response.data;
  },
  updateDropdownField: async (fieldName: string, options: Array<{ value: string; stone_types: string[] }>) => {
    const response = await api.put(`/settings/dropdowns/${fieldName}`, options);
    return response.data;
  },
  initializeDropdowns: async () => {
    const response = await api.post('/settings/dropdowns/initialize');
    return response.data;
  },
  getPricing: async () => {
    const response = await api.get('/pricing');
    return response.data;
  },
  updatePricing: async (data: {
    brackets: Array<{ min_value: number; max_value: number; fees: Record<string, number> }>;
    color_stability_fee: number;
    mounted_jewellery_fee: number;
    service_types: string[];
    payment_destinations?: string[];
    stone_types?: string[];
    shapes?: string[];
    couriers?: string[];
    recheck_reasons?: string[];
  }) => {
    const response = await api.put('/pricing', data);
    return response.data;
  },
  // Rename a service type everywhere it's used (pricing config + every job
  // currently tagged with the old name). The chip-delete UI hides the `×`
  // for service types with existing jobs, so this is the only way to fold
  // a typo'd or legacy service type (e.g. "Recheck Type") into the
  // canonical one ("Recheck"). Returns { jobs_updated: number }.
  renameServiceType: async (oldName: string, newName: string) => {
    const response = await api.post('/pricing/rename-service-type', {
      old_name: oldName,
      new_name: newName,
    });
    return response.data as { message: string; service_types: string[]; jobs_updated: number };
  },
};

// Manual payments API
export const manualPaymentsApi = {
  record: async (
    jobId: string,
    data: { amount: number; destination: string; note?: string; notify_email?: boolean; notify_sms?: boolean }
  ) => {
    const response = await api.post(`/jobs/${jobId}/manual-payment`, data);
    return response.data;
  },
  getReceipt: async (paymentId: string) => {
    const response = await api.get(`/receipts/${paymentId}`);
    return response.data;
  },
};

// Addresses API
export const addressesApi = {
  getAll: async () => {
    const response = await api.get('/addresses');
    return response.data;
  },
  create: async (data: { name: string; address?: string; email?: string; phone?: string }) => {
    const response = await api.post('/addresses', data);
    return response.data;
  },
  update: async (id: string, data: { name?: string; address?: string; email?: string; phone?: string }) => {
    const response = await api.put(`/addresses/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/addresses/${id}`);
    return response.data;
  },
};

// Dashboard API
export const dashboardApi = {
  getStats: async (params?: { branch_id?: string }) => {
    const response = await api.get('/dashboard/stats', { params });
    return response.data;
  },
  getClientsWithActiveJobs: async (params?: { branch_id?: string }) => {
    const response = await api.get('/dashboard/clients-with-active-jobs', { params });
    return response.data;
  },
};

// Notifications API
export const notificationsApi = {
  getStatus: async (jobId: string) => {
    const response = await api.get(`/jobs/${jobId}/notifications/status`);
    return response.data;
  },
  preview: async (jobId: string, notificationType: string) => {
    const response = await api.get(`/jobs/${jobId}/notifications/preview/${notificationType}`);
    return response.data;
  },
  send: async (jobId: string, notificationType: string, recipientEmail: string, customMessage?: string) => {
    const response = await api.post(`/jobs/${jobId}/notifications/send/${notificationType}`, {
      notification_type: notificationType,
      recipient_email: recipientEmail,
      custom_message: customMessage,
    });
    return response.data;
  },
  previewSms: async (jobId: string, notificationType: string) => {
    const response = await api.get(`/jobs/${jobId}/sms/preview/${notificationType}`);
    return response.data;
  },
  sendSms: async (jobId: string, notificationType: string) => {
    const response = await api.post(`/jobs/${jobId}/sms/send/${notificationType}`);
    return response.data;
  },
  getSmsBalance: async () => {
    const response = await api.get('/sms/balance');
    return response.data;
  },
  previewWelcome: async (clientId?: string) => {
    const response = await api.get('/notifications/welcome/preview', {
      params: clientId ? { client_id: clientId } : undefined,
    });
    return response.data;
  },
  sendWelcomeBulk: async (clientIds: string[]) => {
    const response = await api.post('/notifications/welcome/bulk', {
      client_ids: clientIds,
    });
    return response.data;
  },
};

// Pickup Events API (Feb 25, 2026 — memo return + cert collection)
export interface PickupEvent {
  id: string;
  job_id: string;
  branch_id: string | null;
  type: 'memo_return' | 'cert_collection';
  stone_ids: string[];
  signature_request_id: string | null;
  signed_pdf_url: string | null;
  signed_pdf_public_id: string | null;
  finalized_at: string | null;
  printed_at: string;
  printed_by: string | null;
  printed_by_name: string | null;
}

export const pickupsApi = {
  create: async (
    job_id: string,
    type: PickupEvent['type'],
    stone_ids: string[],
    opts?: {
      signature_request_id?: string;
      memo_html_template?: string;
      auto_create_signature_for?: string;
      signature_role?: 'client_collection' | 'cert_collection';
    },
  ) => {
    const response = await api.post('/pickups', {
      job_id,
      type,
      stone_ids,
      ...(opts || {}),
    });
    return response.data as PickupEvent;
  },
  listForJob: async (job_id: string) => {
    const response = await api.get(`/jobs/${job_id}/pickups`);
    return response.data as PickupEvent[];
  },
  delete: async (pickup_id: string) => {
    const response = await api.delete(`/pickups/${pickup_id}`);
    return response.data as { deleted: boolean };
  },
};

// Signature Capture API (Feb 25, 2026 — Phase 1)
export interface SignatureRow {
  id: string;
  job_id: string;
  branch_id: string | null;
  role: 'client_drop_off' | 'client_collection' | 'cert_collection' | 'courier_drop_off';
  signer_name: string;
  status: 'pending' | 'signed' | 'cancelled' | 'expired';
  signed_url: string | null;
  signed_public_id: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  signed_at: string | null;
  signed_by_user_agent: string | null;
  signed_by_ip: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  cancellation_reason: string | null;
}

export const signaturesApi = {
  request: async (job_id: string, role: SignatureRow['role'], signer_name: string) => {
    const response = await api.post('/signatures/request', { job_id, role, signer_name });
    return response.data as SignatureRow;
  },
  /** Pad polls this every 2s. Returns null when nothing is pending. */
  pending: async () => {
    const response = await api.get('/signatures/pending');
    return response.data as SignatureRow | null;
  },
  /** Desktop polls this to learn when the pad has signed. */
  getOne: async (request_id: string) => {
    const response = await api.get(`/signatures/${request_id}`);
    return response.data as SignatureRow;
  },
  listForJob: async (job_id: string) => {
    const response = await api.get(`/jobs/${job_id}/signatures`);
    return response.data as SignatureRow[];
  },
  submit: async (request_id: string, image_base64: string) => {
    const response = await api.post(`/signatures/${request_id}/submit`, { image_base64 });
    return response.data as SignatureRow;
  },
  cancel: async (request_id: string) => {
    const response = await api.post(`/signatures/${request_id}/cancel`);
    return response.data as SignatureRow;
  },
  delete: async (request_id: string) => {
    const response = await api.delete(`/signatures/${request_id}`);
    return response.data as { deleted: boolean };
  },
};

export const SIGNATURE_ROLE_LABELS: Record<SignatureRow['role'], string> = {
  client_drop_off: 'Client drop-off',
  client_collection: 'Client collection',
  cert_collection: 'Certificate collection',
  courier_drop_off: 'Courier drop-off',
};

// Activity Log API
export const activityApi = {
  // Per-job timeline. Admins only on the backend; calling as a customer
  // returns 403 — the UI should only render this when the current user
  // has admin role.
  listForJob: async (jobId: string, limit: number = 100) => {
    const response = await api.get('/activity', {
      params: { job_id: jobId, limit },
    });
    return response.data as ActivityRow[];
  },
  // Global feed for /dashboard/activity. All params are optional; the
  // backend `require_admin` dep silently scopes branch-admins to their own
  // branch. `action` is a list and is serialised with axios's default
  // `paramsSerializer` (`?action=a&action=b`).
  listGlobal: async (params: {
    action?: string[];
    actor_id?: string;
    from_date?: string;
    to_date?: string;
    before?: string;
    limit?: number;
  }) => {
    const response = await api.get('/activity', {
      params,
      // Repeated query keys for the `action` list.
      paramsSerializer: { indexes: null },
    });
    return response.data as ActivityRow[];
  },
  listActions: async () => {
    const response = await api.get('/activity/actions');
    return response.data as Array<{ code: string; label: string }>;
  },
  listActors: async () => {
    const response = await api.get('/activity/actors');
    return response.data as Array<{
      actor_id: string;
      name: string;
      role: string | null;
      last_seen: string | null;
    }>;
  },
};

export interface ActivityRow {
  id: string;
  action: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  job_id: string | null;
  stone_id: string | null;
  shipment_id: string | null;
  client_id: string | null;
  branch_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Cloudinary Upload API
export const cloudinaryApi = {
  getSignature: async (folder: string = 'uploads', resourceType: 'image' | 'raw' = 'image') => {
    const response = await api.get('/cloudinary/signature', {
      params: { folder, resource_type: resourceType }
    });
    return response.data;
  },
  
  uploadFile: async (file: File, folder: string = 'uploads'): Promise<{ url: string; public_id: string }> => {
    // Determine resource type based on file type
    const isImage = file.type.startsWith('image/');
    const resourceType = isImage ? 'image' : 'raw';
    
    console.log(`Uploading file: ${file.name}, type: ${file.type}, resourceType: ${resourceType}`);
    
    // Get signature from backend
    const sig = await cloudinaryApi.getSignature(folder, resourceType);
    
    // Create form data for Cloudinary
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', sig.api_key);
    formData.append('timestamp', sig.timestamp.toString());
    formData.append('signature', sig.signature);
    formData.append('folder', sig.folder);
    if (sig.type) {
      formData.append('type', sig.type);
    }
    
    // Upload directly to Cloudinary
    const uploadUrl = `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${resourceType}/upload`;
    console.log(`Upload URL: ${uploadUrl}`);
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudinary upload error:', errorText);
      throw new Error(`Failed to upload file to Cloudinary: ${errorText}`);
    }
    
    const result = await uploadResponse.json();
    console.log('Cloudinary upload result:', result);
    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  },
  
  deleteFile: async (publicId: string, resourceType: 'image' | 'raw' = 'image') => {
    const response = await api.post('/cloudinary/delete', {
      public_id: publicId,
      resource_type: resourceType,
    });
    return response.data;
  },
};

export default api;
