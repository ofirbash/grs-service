import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
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
};

// Shipments API
export const shipmentsApi = {
  getAll: async (params?: { status?: string; courier?: string }) => {
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
    job_ids?: string[];
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
    certificate_units: Array<{ stones: Array<{ stone_type: string; weight: number; shape: string; value: number; color_stability_test?: boolean }> }>;
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
  update: async (id: string, data: { notes?: string; status?: string }) => {
    const response = await api.put(`/jobs/${id}`, data);
    return response.data;
  },
  addStone: async (id: string, stone: {
    stone_type: string;
    weight: number;
    shape?: string;
    value: number;
    color_stability_test?: boolean;
  }) => {
    const response = await api.post(`/jobs/${id}/stones`, stone);
    return response.data;
  },
};

// Stones API
export const stonesApi = {
  getAll: async () => {
    const response = await api.get('/stones');
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
  }) => {
    const response = await api.put(`/stones/${id}/verbal`, { structured_findings });
    return response.data;
  },
  uploadCertificateScan: async (id: string, filename: string, file_data: string) => {
    const response = await api.put(`/stones/${id}/certificate-scan`, { filename, file_data });
    return response.data;
  },
  uploadGroupCertificateScan: async (job_id: string, certificate_group: number, filename: string, file_data: string) => {
    const response = await api.put('/stones/group/certificate-scan', { job_id, certificate_group, filename, file_data });
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
    return_address: string;
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
    return_address?: string;
    phone?: string;
    email?: string;
  }) => {
    const response = await api.put(`/branches/${id}`, data);
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
    brackets: Array<{ min_value: number; max_value: number; express_fee: number; normal_fee: number; recheck_fee: number }>;
    color_stability_fee: number;
    service_types: string[];
  }) => {
    const response = await api.put('/pricing', data);
    return response.data;
  },
};

// Dashboard API
export const dashboardApi = {
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },
};

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
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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
