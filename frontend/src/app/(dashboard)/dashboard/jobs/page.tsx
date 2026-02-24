"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { jobsApi, clientsApi, branchesApi, stonesApi, settingsApi, cloudinaryApi, notificationsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Briefcase,
  Plus,
  Search,
  Loader2,
  Gem,
  Trash2,
  FileText,
  Upload,
  Pencil,
  Link2,
  CheckSquare,
  Diamond,
  Check,
  Eye,
  Lock,
  Mail,
  Send,
  Clock,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface StructuredVerbalFindings {
  certificate_id?: string;
  weight?: number;
  identification?: string;
  color?: string;
  origin?: string;
  comment?: string;
}

interface Stone {
  id: string;
  sku: string;
  stone_type: string;
  weight: number;
  shape: string;
  value: number;
  fee: number;
  actual_fee?: number;
  color_stability_test?: boolean;
  certificate_group?: number;
  verbal_findings?: string | StructuredVerbalFindings;
  certificate_scan_url?: string;
}

interface DropdownOption {
  value: string;
  stone_types: string[];
}

interface DropdownSettings {
  identification: DropdownOption[];
  color: DropdownOption[];
  origin: DropdownOption[];
  comment: DropdownOption[];
}

interface CertificateGroup {
  groupNumber: number | null;
  stones: Stone[];
  label: string;
}

interface Job {
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
  total_stones: number;
  total_value: number;
  total_fee: number;
  shipment_ids?: string[];
  shipment_info?: {
    shipment_number: number;
    shipment_type: string;
    status: string;
  };
  signed_memo_url?: string;
  lab_invoice_url?: string;
  lab_invoice_filename?: string;
  invoice_url?: string;
  invoice_filename?: string;
  created_at: string;
}

interface NotificationStatus {
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

interface NotificationPreview {
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

// Notification type labels for display
const NOTIFICATION_LABELS: Record<string, string> = {
  stones_accepted: 'Stones Received',
  verbal_uploaded: 'Verbal Results',
  stones_returned: 'Stones Ready',
  cert_uploaded: 'Cert. Scans Available',
  cert_returned: 'Certificates Ready',
};

// Helper function to get certificate group label based on stone count
const getCertificateLabel = (stoneCount: number): string => {
  if (stoneCount === 1) return 'Single';
  if (stoneCount === 2) return 'Pair';
  if (stoneCount >= 3 && stoneCount <= 6) return 'Layout';
  if (stoneCount > 6) return 'Multi-Stone';
  return 'Group';
};

// Helper function to organize stones by certificate groups
const organizeStonesIntoGroups = (stones: Stone[]): CertificateGroup[] => {
  const groupMap = new Map<number | null, Stone[]>();
  
  // First, organize stones by their certificate_group
  stones.forEach(stone => {
    const groupKey = stone.certificate_group ?? null;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push(stone);
  });
  
  const groups: CertificateGroup[] = [];
  
  // Add grouped stones first (sorted by group number)
  const groupedEntries = Array.from(groupMap.entries())
    .filter(([key]) => key !== null)
    .sort(([a], [b]) => (a as number) - (b as number));
  
  groupedEntries.forEach(([groupNumber, groupStones]) => {
    groups.push({
      groupNumber: groupNumber as number,
      stones: groupStones,
      label: getCertificateLabel(groupStones.length)
    });
  });
  
  // Add ungrouped stones last
  const ungroupedStones = groupMap.get(null);
  if (ungroupedStones && ungroupedStones.length > 0) {
    ungroupedStones.forEach(stone => {
      groups.push({
        groupNumber: null,
        stones: [stone],
        label: 'Ungrouped'
      });
    });
  }
  
  return groups;
};

interface Client {
  id: string;
  name: string;
  email: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

const STONE_TYPES = ['Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Alexandrite', 'Spinel', 'Padparadscha', 'Paraiba', 'Tanzanite', 'Other'];
const SHAPES = ['Round', 'Oval', 'Cushion', 'Pear', 'Heart', 'Marquise', 'Princess', 'Emerald Cut', 'Cabochon', 'Other'];
const SERVICE_TYPES = ['Express', 'Normal', 'Recheck'];

export default function JobsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labInvoiceInputRef = useRef<HTMLInputElement>(null);

  // Bulk job selection for status update
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [updatingBulkStatus, setUpdatingBulkStatus] = useState(false);

  // Create job dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    client_id: '',
    branch_id: '',
    service_type: '',
    notes: '',
  });
  const [stones, setStones] = useState<Array<{
    stone_type: string;
    weight: string;
    shape: string;
    value: string;
    color_stability_test: boolean;
  }>>([{ stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Check if form has any data (for unsaved changes warning)
  const hasUnsavedChanges = () => {
    const hasFormData = formData.client_id || formData.branch_id || formData.service_type || formData.notes;
    const hasStoneData = stones.some(s => s.stone_type || s.weight || s.value || s.shape);
    return hasFormData || hasStoneData;
  };

  // Check if form is valid for submission (all required fields filled)
  const isFormValid = () => {
    const hasRequiredFields = formData.client_id && formData.branch_id && formData.service_type;
    const hasValidStone = stones.some(s => s.stone_type && s.weight && s.value);
    return hasRequiredFields && hasValidStone;
  };

  // Handle dialog close with unsaved changes warning
  const handleCreateDialogClose = (open: boolean) => {
    if (!open && hasUnsavedChanges()) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close without saving?');
      if (!confirmed) return;
    }
    setCreateDialogOpen(open);
    if (!open) {
      // Reset form when closing
      setValidationErrors([]);
      setFormData({ client_id: '', branch_id: '', service_type: '', notes: '' });
      setStones([{ stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
    }
  };

  // View/Edit job dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({
    notes: '',
    status: '',
  });

  // Certificate grouping
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [selectedStones, setSelectedStones] = useState<string[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);

  // Add stone to existing job
  const [addStoneDialogOpen, setAddStoneDialogOpen] = useState(false);
  const [addingStone, setAddingStone] = useState(false);
  const [newStone, setNewStone] = useState({
    stone_type: '',
    weight: '',
    shape: '',
    value: '',
  });

  // Nested Stone dialog (opens on top of job dialog)
  const [stoneDialogOpen, setStoneDialogOpen] = useState(false);
  const [viewingStone, setViewingStone] = useState<Stone | null>(null);
  const [savingStoneVerbal, setSavingStoneVerbal] = useState(false);
  const [uploadingCertScan, setUploadingCertScan] = useState(false);
  const [viewCertScanOpen, setViewCertScanOpen] = useState(false);
  const [verbalEditMode, setVerbalEditMode] = useState(false);
  const certScanInputRef = useRef<HTMLInputElement>(null);
  
  // Stone fee editing
  const [stoneActualFee, setStoneActualFee] = useState<string>('');
  const [stoneColorStability, setStoneColorStability] = useState<boolean>(false);
  
  // Structured verbal findings
  const [dropdownSettings, setDropdownSettings] = useState<DropdownSettings>({
    identification: [],
    color: [],
    origin: [],
    comment: []
  });
  const [structuredFindings, setStructuredFindings] = useState<StructuredVerbalFindings>({
    certificate_id: '',
    weight: 0,
    identification: '',
    color: '',
    origin: '',
    comment: ''
  });

  // Memo upload
  const [uploading, setUploading] = useState(false);
  const [viewMemoOpen, setViewMemoOpen] = useState(false);
  
  // Lab Invoice upload (admin only)
  const [uploadingLabInvoice, setUploadingLabInvoice] = useState(false);
  const [viewLabInvoiceOpen, setViewLabInvoiceOpen] = useState(false);

  // Email Notifications
  const [notificationStatuses, setNotificationStatuses] = useState<NotificationStatus[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [notificationPreview, setNotificationPreview] = useState<NotificationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Invoice generation
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [viewInvoiceOpen, setViewInvoiceOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Handle opening a specific job from URL parameter
  useEffect(() => {
    // Support both jobId (from dashboard) and job (job number)
    const jobId = searchParams.get('jobId');
    const jobNumber = searchParams.get('job');
    
    if (jobs.length > 0) {
      let job: Job | undefined;
      
      if (jobId) {
        job = jobs.find(j => j.id === jobId);
      } else if (jobNumber) {
        job = jobs.find(j => j.job_number === parseInt(jobNumber));
      }
      
      if (job) {
        setSelectedJob(job);
        setEditFormData({ notes: job.notes || '', status: job.status });
        setViewDialogOpen(true);
      }
    }
  }, [searchParams, jobs]);

  const fetchData = async () => {
    try {
      const [jobsData, clientsData, branchesData, dropdownData] = await Promise.all([
        jobsApi.getAll(),
        clientsApi.getAll(),
        branchesApi.getAll(),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
      ]);
      setJobs(jobsData);
      setClients(clientsData);
      setBranches(branchesData);
      setDropdownSettings(dropdownData);
      
      // Initialize dropdowns if empty
      if (!dropdownData.identification?.length) {
        settingsApi.initializeDropdowns().then(() => {
          settingsApi.getDropdowns().then(setDropdownSettings);
        });
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Bulk update status for selected jobs
  const handleBulkStatusUpdate = async () => {
    if (selectedJobIds.length === 0 || !bulkStatus) return;
    
    setUpdatingBulkStatus(true);
    try {
      await Promise.all(
        selectedJobIds.map(jobId => jobsApi.updateStatus(jobId, bulkStatus))
      );
      setBulkStatusDialogOpen(false);
      setBulkStatus('');
      setSelectedJobIds([]);
      fetchData();
    } catch (error) {
      console.error('Failed to update job statuses:', error);
    } finally {
      setUpdatingBulkStatus(false);
    }
  };

  // Toggle job selection
  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds(prev => 
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  // Select all visible jobs
  const selectAllJobs = () => {
    const visibleJobIds = filteredJobs.map(j => j.id);
    if (selectedJobIds.length === visibleJobIds.length) {
      setSelectedJobIds([]);
    } else {
      setSelectedJobIds(visibleJobIds);
    }
  };

  const handleAddStone = () => {
    setStones([...stones, { stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
  };

  const handleRemoveStone = (index: number) => {
    if (stones.length > 1) {
      setStones(stones.filter((_, i) => i !== index));
    }
  };

  const handleStoneChange = (index: number, field: string, value: string | boolean) => {
    const newStones = [...stones];
    newStones[index] = { ...newStones[index], [field]: value };
    setStones(newStones);
  };

  // Helper to open stone dialog with proper initialization
  const openStoneDialog = (stone: Stone) => {
    setViewingStone(stone);
    
    // Initialize structured findings from stone data
    // verbal_findings can be: undefined, null, string, or object
    const vf = stone.verbal_findings;
    const findings = (vf && typeof vf === 'object') ? vf as StructuredVerbalFindings : null;
    
    setStructuredFindings({
      certificate_id: findings?.certificate_id || '',
      weight: findings?.weight || stone.weight,  // Default to stone's weight
      identification: findings?.identification || '',
      color: findings?.color || '',
      origin: findings?.origin || '',
      comment: findings?.comment || ''
    });
    
    // Initialize fee fields
    setStoneActualFee(stone.actual_fee !== undefined ? String(stone.actual_fee) : String(stone.fee));
    setStoneColorStability(stone.color_stability_test || false);
    
    // Always start in locked mode - user must click "Edit" to modify
    setVerbalEditMode(false);
    
    setStoneDialogOpen(true);
  };

  // Save stone fees from job modal
  const handleCreateJob = async () => {
    const errors: string[] = [];
    
    // Validate mandatory fields
    if (!formData.client_id) {
      errors.push('Client is required');
    }
    if (!formData.branch_id) {
      errors.push('Branch is required');
    }
    if (!formData.service_type) {
      errors.push('Service type is required');
    }

    // Validate stones - at least one stone with required fields (shape is optional)
    const validStones = stones.filter(s => s.stone_type && s.weight && s.value);
    
    if (validStones.length === 0) {
      errors.push('At least one stone with type, weight, and value is required');
    }

    // Check each stone for missing required fields
    stones.forEach((stone, index) => {
      const hasAnyData = stone.stone_type || stone.weight || stone.value || stone.shape;
      if (hasAnyData) {
        if (!stone.stone_type) {
          errors.push(`Stone ${index + 1}: Type is required`);
        }
        if (!stone.weight) {
          errors.push(`Stone ${index + 1}: Weight is required`);
        }
        if (!stone.value) {
          errors.push(`Stone ${index + 1}: Value is required`);
        }
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors([]);
    setCreating(true);
    try {
      await jobsApi.create({
        ...formData,
        certificate_units: [{
          stones: validStones.map(s => ({
            stone_type: s.stone_type,
            weight: parseFloat(s.weight),
            shape: s.shape || 'Other', // Default to 'Other' if not specified
            value: parseFloat(s.value),
            color_stability_test: s.color_stability_test,
          })),
        }],
      });
      // Close dialog and reset form (handleCreateDialogClose handles cleanup)
      setCreateDialogOpen(false);
      setFormData({ client_id: '', branch_id: '', service_type: '', notes: '' });
      setStones([{ stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
      setValidationErrors([]);
      fetchData();
    } catch (error) {
      console.error('Failed to create job:', error);
      setValidationErrors(['Failed to create job. Please try again.']);
    } finally {
      setCreating(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.job_number.toString().includes(searchTerm) ||
      job.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openJobDetails = (job: Job) => {
    setSelectedJob(job);
    setEditFormData({
      notes: job.notes || '',
      status: job.status,
    });
    setEditMode(false);
    setSelectedStones([]);
    setViewDialogOpen(true);
    // Fetch notification statuses for admin users
    if (user?.role === 'super_admin' || user?.role === 'branch_admin') {
      fetchNotificationStatuses(job.id);
    }
  };

  const handleUpdateJob = async () => {
    if (!selectedJob) return;
    
    try {
      await jobsApi.update(selectedJob.id, {
        notes: editFormData.notes,
        status: editFormData.status,
      });
      fetchData();
      setEditMode(false);
      // Refresh selected job
      const updatedJobs = await jobsApi.getAll();
      const updated = updatedJobs.find((j: Job) => j.id === selectedJob.id);
      if (updated) {
        setSelectedJob(updated);
        // Refresh notification statuses after status change
        if (user?.role === 'super_admin' || user?.role === 'branch_admin') {
          fetchNotificationStatuses(updated.id);
        }
      }
    } catch (error) {
      console.error('Failed to update job:', error);
    }
  };

  const handlePrintJob = (job: Job) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print');
      return;
    }

    // Separate ungrouped and grouped stones
    const ungroupedStones = job.stones.filter(s => !s.certificate_group);
    const groupedStonesMap = new Map<number, Stone[]>();
    job.stones.filter(s => s.certificate_group).forEach(s => {
      const group = s.certificate_group!;
      if (!groupedStonesMap.has(group)) groupedStonesMap.set(group, []);
      groupedStonesMap.get(group)!.push(s);
    });
    
    // Generate certificate summary
    const certSummaryItems = Array.from(groupedStonesMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupNum, stones]) => `Certificate ${groupNum}: ${stones.length} stone${stones.length > 1 ? 's' : ''} (${getCertificateLabel(stones.length)})`)
      .join(', ');
    
    const certSummary = certSummaryItems + (ungroupedStones.length > 0 ? `, ${ungroupedStones.length} ungrouped` : '');

    // Generate ungrouped stones rows
    let rowIndex = 1;
    const ungroupedRows = ungroupedStones.map((stone) => `
      <tr>
        <td>${rowIndex++}</td>
        <td>${stone.sku}</td>
        <td>${stone.stone_type}</td>
        <td>${stone.weight} ct</td>
        <td>${stone.shape}</td>
        <td>$${stone.value.toLocaleString()}</td>
        <td>$${stone.fee.toLocaleString()}</td>
      </tr>
    `).join('');

    // Generate grouped stones rows with separator headers
    const groupedRows = Array.from(groupedStonesMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([groupNum, stones]) => {
        const groupHeader = `
          <tr class="group-separator">
            <td colspan="7">
              <strong>Certificate ${groupNum}</strong> - ${getCertificateLabel(stones.length)} (${stones.length} stone${stones.length > 1 ? 's' : ''})
            </td>
          </tr>
        `;
        const stoneRows = stones.map((stone) => `
          <tr class="grouped-row">
            <td>${rowIndex++}</td>
            <td>${stone.sku}</td>
            <td>${stone.stone_type}</td>
            <td>${stone.weight} ct</td>
            <td>${stone.shape}</td>
            <td>$${stone.value.toLocaleString()}</td>
            <td>$${stone.fee.toLocaleString()}</td>
          </tr>
        `).join('');
        return groupHeader + stoneRows;
      }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job #${job.job_number} - GRS Global</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; }
          h1 { color: #102a43; border-bottom: 2px solid #102a43; padding-bottom: 10px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; color: #102a43; }
          .section { margin: 20px 0; padding: 15px; background: #f0f4f8; border-radius: 8px; }
          .section h3 { margin: 0 0 10px 0; color: #334e68; }
          .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; }
          .field { margin: 5px 0; }
          .label { font-weight: bold; color: #486581; font-size: 12px; }
          .value { color: #102a43; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background: #102a43; color: white; }
          tr:nth-child(even):not(.group-separator) { background: #f9f9f9; }
          .group-separator { background: #334e68 !important; color: white; }
          .group-separator td { padding: 6px 8px; border-color: #334e68; }
          .grouped-row { background: #f8fafc; }
          .cert-summary { background: #fef3c7; padding: 12px; border-radius: 6px; margin: 10px 0; }
          .cert-summary strong { color: #92400e; }
          .totals { margin-top: 20px; text-align: right; padding: 15px; background: #102a43; color: white; border-radius: 6px; }
          .totals .item { display: inline-block; margin-left: 30px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; color: #627d98; font-size: 12px; }
          @media print { 
            body { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">GRS Global</div>
          <div>Job #${job.job_number}</div>
        </div>
        
        <div class="section">
          <h3>Job Details</h3>
          <div class="grid">
            <div class="field">
              <div class="label">Client</div>
              <div class="value">${job.client_name || 'N/A'}</div>
            </div>
            <div class="field">
              <div class="label">Branch</div>
              <div class="value">${job.branch_name || 'N/A'}</div>
            </div>
            <div class="field">
              <div class="label">Service Type</div>
              <div class="value">${job.service_type}</div>
            </div>
            <div class="field">
              <div class="label">Status</div>
              <div class="value">${job.status.replace(/_/g, ' ')}</div>
            </div>
            <div class="field">
              <div class="label">Total Stones</div>
              <div class="value">${job.total_stones}</div>
            </div>
            <div class="field">
              <div class="label">Created</div>
              <div class="value">${new Date(job.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
        
        ${groupedStonesMap.size > 0 ? `
        <div class="section">
          <h3>Certificate Summary</h3>
          <div class="cert-summary">
            <strong>Certificates:</strong> ${certSummary}
          </div>
        </div>
        ` : ''}
        
        <div class="section">
          <h3>Stones</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Type</th>
                <th>Weight</th>
                <th>Shape</th>
                <th>Value</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              ${ungroupedRows}
              ${groupedRows}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="item"><strong>Total Stones:</strong> ${job.total_stones}</div>
            <div class="item"><strong>Total Value:</strong> $${job.total_value.toLocaleString()}</div>
            <div class="item"><strong>Total Fee:</strong> $${job.total_fee.toLocaleString()}</div>
          </div>
        </div>
        
        ${job.notes ? `
        <div class="section">
          <h3>Notes</h3>
          <p>${job.notes}</p>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          <p>GRS Global Lab Logistics & ERP System</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleGroupStones = async () => {
    if (!selectedJob || selectedStones.length === 0) return;
    if (selectedStones.length > 30) {
      alert('Maximum 30 stones per certificate group');
      return;
    }

    setSavingGroup(true);
    try {
      // Find the next available group number
      const existingGroups = selectedJob.stones
        .map(s => s.certificate_group)
        .filter((g): g is number => g !== undefined);
      const nextGroup = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1;

      // Call API to update stone certificate groups
      await jobsApi.groupStones(selectedJob.id, selectedStones, nextGroup);
      
      // Refresh the job data
      fetchData();
      const updatedJobs = await jobsApi.getAll();
      const updated = updatedJobs.find((j: Job) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
      
      setSelectedStones([]);
      setGroupDialogOpen(false);
    } catch (error) {
      console.error('Failed to group stones:', error);
    } finally {
      setSavingGroup(false);
    }
  };

  const handleUngroupStones = async () => {
    if (!selectedJob || selectedStones.length === 0) return;

    setSavingGroup(true);
    try {
      // Call API to ungroup stones
      await jobsApi.ungroupStones(selectedJob.id, selectedStones);
      
      // Refresh the job data
      fetchData();
      const updatedJobs = await jobsApi.getAll();
      const updated = updatedJobs.find((j: Job) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
      
      setSelectedStones([]);
    } catch (error) {
      console.error('Failed to ungroup stones:', error);
    } finally {
      setSavingGroup(false);
    }
  };

  // Check if all selected stones are already grouped (same group)
  const areAllSelectedStonesGrouped = () => {
    if (!selectedJob || selectedStones.length === 0) return false;
    const selectedStoneObjects = selectedJob.stones.filter(s => selectedStones.includes(s.id));
    return selectedStoneObjects.every(s => s.certificate_group !== undefined && s.certificate_group !== null);
  };

  // Check if any selected stone is already in a group (to prevent re-grouping)
  const anySelectedStoneGrouped = () => {
    if (!selectedJob || selectedStones.length === 0) return false;
    const selectedStoneObjects = selectedJob.stones.filter(s => selectedStones.includes(s.id));
    return selectedStoneObjects.some(s => s.certificate_group !== undefined && s.certificate_group !== null);
  };

  const handleAddStoneToJob = async () => {
    if (!selectedJob) return;
    if (!newStone.stone_type || !newStone.weight || !newStone.value) {
      alert('Please fill in stone type, weight, and value');
      return;
    }

    setAddingStone(true);
    try {
      await jobsApi.addStone(selectedJob.id, {
        stone_type: newStone.stone_type,
        weight: parseFloat(newStone.weight),
        shape: newStone.shape || 'Other',
        value: parseFloat(newStone.value),
      });
      
      // Refresh the job data
      fetchData();
      const updatedJobs = await jobsApi.getAll();
      const updated = updatedJobs.find((j: Job) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
      
      // Reset form and close dialog
      setNewStone({ stone_type: '', weight: '', shape: '', value: '' });
      setAddStoneDialogOpen(false);
    } catch (error) {
      console.error('Failed to add stone:', error);
      alert('Failed to add stone. Please try again.');
    } finally {
      setAddingStone(false);
    }
  };

  const handleMemoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;

    setUploading(true);
    try {
      // Upload to Cloudinary
      const folder = `memos/${selectedJob.id}`;
      const { url } = await cloudinaryApi.uploadFile(file, folder);
      
      // Save URL to backend
      await jobsApi.uploadMemo(selectedJob.id, file.name, url);
      fetchData();
      const updatedJobs = await jobsApi.getAll();
      const updated = updatedJobs.find((j: Job) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
    } catch (error) {
      console.error('Failed to upload memo:', error);
      alert('Failed to upload memo. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLabInvoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;

    setUploadingLabInvoice(true);
    try {
      // Upload to Cloudinary
      const folder = `invoices/${selectedJob.id}`;
      const { url } = await cloudinaryApi.uploadFile(file, folder);
      
      // Save URL to backend
      await jobsApi.uploadLabInvoice(selectedJob.id, file.name, url);
      fetchData();
      const updatedJobs = await jobsApi.getAll();
      const updated = updatedJobs.find((j: Job) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
    } catch (error) {
      console.error('Failed to upload lab invoice:', error);
      alert('Failed to upload lab invoice. Please try again.');
    } finally {
      setUploadingLabInvoice(false);
      if (labInvoiceInputRef.current) {
        labInvoiceInputRef.current.value = '';
      }
    }
  };

  // Fetch notification statuses for a job
  const fetchNotificationStatuses = async (jobId: string) => {
    setLoadingNotifications(true);
    try {
      const data = await notificationsApi.getStatus(jobId);
      setNotificationStatuses(data.notifications || []);
    } catch (error) {
      console.error('Failed to fetch notification statuses:', error);
      setNotificationStatuses([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Preview notification email
  const handlePreviewNotification = async (notificationType: string) => {
    if (!selectedJob) return;
    
    setLoadingPreview(true);
    setPreviewModalOpen(true);
    try {
      const preview = await notificationsApi.preview(selectedJob.id, notificationType);
      setNotificationPreview(preview);
    } catch (error) {
      console.error('Failed to load preview:', error);
      alert('Failed to load email preview. Please try again.');
      setPreviewModalOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Send notification email
  const handleSendNotification = async () => {
    if (!selectedJob || !notificationPreview) return;
    
    setSendingEmail(true);
    try {
      await notificationsApi.send(
        selectedJob.id,
        notificationPreview.notification_type,
        notificationPreview.recipient_email
      );
      alert(`Email sent successfully to ${notificationPreview.recipient_email}`);
      setPreviewModalOpen(false);
      setNotificationPreview(null);
      // Refresh notification statuses
      fetchNotificationStatuses(selectedJob.id);
    } catch (error: unknown) {
      console.error('Failed to send email:', error);
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to send email. Please try again.');
    } finally {
      setSendingEmail(false);
    }
  };

  // Generate and save invoice
  const handleGenerateInvoice = async () => {
    if (!selectedJob) return;
    
    setGeneratingInvoice(true);
    try {
      const result = await jobsApi.generateInvoice(selectedJob.id);
      alert('Invoice generated successfully!');
      
      // Update local state with new invoice URL
      setSelectedJob(prev => prev ? { 
        ...prev, 
        invoice_url: result.invoice_url,
        invoice_filename: result.filename 
      } : null);
      
      // Refresh jobs list
      fetchData();
    } catch (error: unknown) {
      console.error('Failed to generate invoice:', error);
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to generate invoice. Please try again.');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const toggleStoneSelection = (stoneId: string) => {
    setSelectedStones(prev => 
      prev.includes(stoneId) 
        ? prev.filter(id => id !== stoneId)
        : [...prev, stoneId]
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
      draft: 'secondary',
      stones_accepted: 'secondary',
      sent_to_lab: 'default',
      verbal_uploaded: 'default',
      stones_returned: 'warning',
      cert_uploaded: 'success',
      cert_returned: 'success',
      done: 'success',
      // Legacy statuses for backward compatibility
      received: 'secondary',
      certificates_scanned: 'success',
      certificates_sent: 'success',
    };
    const labels: Record<string, string> = {
      draft: 'Draft',
      stones_accepted: 'Stones Accepted',
      sent_to_lab: 'Sent to Lab',
      verbal_uploaded: 'Verbal Uploaded',
      stones_returned: 'Stones Returned',
      cert_uploaded: 'Cert. Uploaded',
      cert_returned: 'Cert. Returned',
      done: 'Done',
      // Legacy status labels
      received: 'Draft',
      certificates_scanned: 'Cert. Uploaded',
      certificates_sent: 'Cert. Returned',
    };
    return <Badge variant={variants[status] || 'secondary'}>{labels[status] || status.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="jobs-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy-900">Jobs</h2>
          <p className="text-navy-600">Manage gemstone testing jobs</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-navy-800 hover:bg-navy-700"
            data-testid="create-job-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Job
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="border-navy-100">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-navy-400" />
                <Input
                  placeholder="Search by job # or client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-navy-200"
                  data-testid="jobs-search-input"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 border-navy-200" data-testid="jobs-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
                <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
                <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
                <SelectItem value="stones_returned">Stones Returned</SelectItem>
                <SelectItem value="cert_uploaded">Cert. Uploaded</SelectItem>
                <SelectItem value="cert_returned">Cert. Returned</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card className="border-navy-100">
        <CardHeader className="border-b border-navy-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              All Jobs ({filteredJobs.length})
            </CardTitle>
            {isAdmin && selectedJobIds.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setBulkStatusDialogOpen(true)}
                data-testid="bulk-status-button"
              >
                Update Status ({selectedJobIds.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredJobs.length === 0 ? (
            <div className="p-8 text-center text-navy-500">
              <Briefcase className="h-12 w-12 mx-auto mb-4 text-navy-300" />
              <p>No jobs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-navy-50">
                    {isAdmin && (
                      <TableHead className="font-semibold text-navy-700 w-12">
                        <input
                          type="checkbox"
                          checked={filteredJobs.length > 0 && selectedJobIds.length === filteredJobs.length}
                          onChange={selectAllJobs}
                          className="h-4 w-4 rounded border-navy-300"
                          data-testid="select-all-jobs"
                        />
                      </TableHead>
                    )}
                    <TableHead className="font-semibold text-navy-700">Job #</TableHead>
                    <TableHead className="font-semibold text-navy-700">Client</TableHead>
                    <TableHead className="font-semibold text-navy-700">Branch</TableHead>
                    <TableHead className="font-semibold text-navy-700">Service</TableHead>
                    <TableHead className="font-semibold text-navy-700">Stones</TableHead>
                    <TableHead className="font-semibold text-navy-700">Value</TableHead>
                    <TableHead className="font-semibold text-navy-700">Fee</TableHead>
                    <TableHead className="font-semibold text-navy-700">Status</TableHead>
                    <TableHead className="font-semibold text-navy-700">Shipment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow
                      key={job.id}
                      className={`hover:bg-navy-50 cursor-pointer ${selectedJobIds.includes(job.id) ? 'bg-navy-100' : ''}`}
                      data-testid={`job-row-${job.job_number}`}
                    >
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedJobIds.includes(job.id)}
                            onChange={() => toggleJobSelection(job.id)}
                            className="h-4 w-4 rounded border-navy-300"
                            data-testid={`select-job-${job.job_number}`}
                          />
                        </TableCell>
                      )}
                      <TableCell 
                        className="font-medium text-navy-800"
                        onClick={() => openJobDetails(job)}
                      >
                        #{job.job_number}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {job.client_name || 'N/A'}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {job.branch_name || 'N/A'}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {job.service_type}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {job.total_stones}
                      </TableCell>
                      <TableCell className="text-navy-600 font-medium" onClick={() => openJobDetails(job)}>
                        ${job.total_value.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {(() => {
                          const totalActual = job.stones.reduce((sum, s) => sum + (s.actual_fee ?? s.fee), 0);
                          const hasDifferentActual = job.stones.some(s => s.actual_fee !== undefined && s.actual_fee !== s.fee);
                          return (
                            <div className="space-y-0.5">
                              <p className="font-medium">${job.total_fee.toLocaleString()}</p>
                              {hasDifferentActual && (
                                <p className="text-xs text-green-600">Actual: ${totalActual.toLocaleString()}</p>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell onClick={() => openJobDetails(job)}>
                        {getStatusBadge(job.status)}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {job.shipment_info ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline">#{job.shipment_info.shipment_number}</Badge>
                            <span className="text-xs text-navy-400">{job.shipment_info.status}</span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Job Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">Create New Job</DialogTitle>
            <DialogDescription>Create a new job with stones for testing</DialogDescription>
          </DialogHeader>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-1">Please fix the following errors:</p>
              <ul className="list-disc list-inside text-sm text-red-700">
                {validationErrors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-6 py-4">
            {/* Job Details */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Client <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.client_id}
                  onValueChange={(value) => setFormData({ ...formData, client_id: value })}
                >
                  <SelectTrigger data-testid="job-client-select">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Branch <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.branch_id}
                  onValueChange={(value) => setFormData({ ...formData, branch_id: value })}
                >
                  <SelectTrigger data-testid="job-branch-select">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Service Type <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.service_type}
                  onValueChange={(value) => setFormData({ ...formData, service_type: value })}
                >
                  <SelectTrigger data-testid="job-service-select">
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stones */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">Stones <span className="text-red-500">*</span></Label>
                  <p className="text-xs text-navy-500 mt-1">At least one stone required. Shape is optional.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddStone}
                  data-testid="add-stone-button"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Stone
                </Button>
              </div>

              <div className="border border-navy-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr,100px,120px,120px,auto] gap-2 p-3 bg-navy-50 text-sm font-medium text-navy-700">
                  <div>Type <span className="text-red-500">*</span></div>
                  <div>Weight <span className="text-red-500">*</span></div>
                  <div>Shape</div>
                  <div>Value <span className="text-red-500">*</span></div>
                  <div></div>
                </div>
                {stones.map((stone, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr,100px,120px,120px,auto] gap-2 p-3 border-t border-navy-200"
                  >
                    <Select
                      value={stone.stone_type}
                      onValueChange={(value) => handleStoneChange(index, 'stone_type', value)}
                    >
                      <SelectTrigger data-testid={`stone-type-${index}`}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {STONE_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={stone.weight}
                      onChange={(e) => handleStoneChange(index, 'weight', e.target.value)}
                      className="border-navy-200"
                      data-testid={`stone-weight-${index}`}
                    />

                    <Select
                      value={stone.shape}
                      onValueChange={(value) => handleStoneChange(index, 'shape', value)}
                    >
                      <SelectTrigger data-testid={`stone-shape-${index}`}>
                        <SelectValue placeholder="Shape" />
                      </SelectTrigger>
                      <SelectContent>
                        {SHAPES.map((shape) => (
                          <SelectItem key={shape} value={shape}>
                            {shape}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={stone.value}
                      onChange={(e) => handleStoneChange(index, 'value', e.target.value)}
                      className="border-navy-200"
                      data-testid={`stone-value-${index}`}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveStone(index)}
                      disabled={stones.length === 1}
                      className="text-red-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCreateDialogClose(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateJob}
              disabled={creating || !isFormValid()}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-create-job-button"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Job'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Job Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={(open) => {
        setViewDialogOpen(open);
        if (!open) {
          setEditMode(false);
          setSelectedStones([]);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
              <span>Job #{selectedJob?.job_number}</span>
              {selectedJob && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePrintJob(selectedJob)}
                    data-testid="print-job-button"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(!editMode)}
                      data-testid="edit-job-button"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      {editMode ? 'Cancel Edit' : 'Edit'}
                    </Button>
                  )}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-4 py-4">
              {/* Job Details */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-navy-500">Client</Label>
                  <p className="font-medium text-navy-800">{selectedJob.client_name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Branch</Label>
                  <p className="font-medium text-navy-800">{selectedJob.branch_name || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Service Type</Label>
                  <p className="font-medium text-navy-800">{selectedJob.service_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Status</Label>
                  {editMode ? (
                    <Select
                      value={editFormData.status}
                      onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                    >
                      <SelectTrigger className="mt-1" data-testid="edit-status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
                        <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
                        <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
                        <SelectItem value="stones_returned">Stones Returned</SelectItem>
                        <SelectItem value="cert_uploaded">Cert. Uploaded</SelectItem>
                        <SelectItem value="cert_returned">Cert. Returned</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1">{getStatusBadge(selectedJob.status)}</div>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500">Total Value</Label>
                  <p className="font-medium text-navy-800">${selectedJob.total_value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Total Est. Fees</Label>
                  <p className="font-medium text-navy-800">${selectedJob.total_fee.toLocaleString()}</p>
                </div>
                {(() => {
                  const totalActual = selectedJob.stones.reduce((sum, s) => sum + (s.actual_fee ?? s.fee), 0);
                  const hasDifferentActual = selectedJob.stones.some(s => s.actual_fee !== undefined && s.actual_fee !== s.fee);
                  return hasDifferentActual ? (
                    <div>
                      <Label className="text-navy-500">Total Actual Fees</Label>
                      <p className="font-medium text-green-700">${totalActual.toLocaleString()}</p>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Notes */}
              {editMode ? (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <Textarea
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                    className="mt-1"
                    rows={2}
                  />
                </div>
              ) : selectedJob.notes ? (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-800">{selectedJob.notes}</p>
                </div>
              ) : null}

              {/* Save Edit Button */}
              {editMode && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleUpdateJob}
                    className="bg-navy-800 hover:bg-navy-700"
                    data-testid="save-job-button"
                  >
                    Save Changes
                  </Button>
                </div>
              )}

              {/* Signed Memo Section - Admin Only for Upload */}
              <div className="border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Signed Memo
                </Label>
                <div className="mt-2 flex items-center gap-3">
                  {isAdmin && (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleMemoUpload}
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        data-testid="upload-memo-button"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            {selectedJob.signed_memo_url ? 'Replace Memo' : 'Upload Memo'}
                          </>
                        )}
                      </Button>
                    </>
                  )}
                  
                  {selectedJob.signed_memo_url && (
                    <Button
                      variant="outline"
                      onClick={() => setViewMemoOpen(true)}
                      data-testid="view-memo-button"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Memo
                    </Button>
                  )}
                </div>
              </div>

              {/* Invoice Section - Admin Only */}
              {isAdmin && (
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Client Invoice
                    <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">For Email</Badge>
                  </Label>
                  <p className="text-sm text-navy-500">Generate invoice with actual fees to send to client</p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={handleGenerateInvoice}
                      disabled={generatingInvoice}
                      className="border-green-300 text-green-700 hover:bg-green-50"
                      data-testid="generate-invoice-button"
                    >
                      {generatingInvoice ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Receipt className="h-4 w-4 mr-2" />
                          {selectedJob.invoice_url ? 'Regenerate Invoice' : 'Generate Invoice'}
                        </>
                      )}
                    </Button>
                    
                    {selectedJob.invoice_url && (
                      <Button
                        variant="outline"
                        onClick={() => setViewInvoiceOpen(true)}
                        data-testid="view-invoice-button"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Invoice
                      </Button>
                    )}
                  </div>
                  {selectedJob.invoice_url && (
                    <p className="text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3 inline mr-1" />
                      Invoice ready - will be attached to &quot;Stones Returned&quot; email
                    </p>
                  )}
                </div>
              )}

              {/* Lab Invoice Section - Admin Only */}
              {isAdmin && (
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Lab Invoice
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">Admin Only</Badge>
                  </Label>
                  <p className="text-sm text-navy-500">Internal document - not visible to customers</p>
                  <div className="flex items-center gap-2">
                    <input
                      ref={labInvoiceInputRef}
                      type="file"
                      onChange={handleLabInvoiceUpload}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => labInvoiceInputRef.current?.click()}
                      disabled={uploadingLabInvoice}
                      data-testid="upload-lab-invoice-button"
                    >
                      {uploadingLabInvoice ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          {selectedJob.lab_invoice_url ? 'Replace Invoice' : 'Upload Invoice'}
                        </>
                      )}
                    </Button>
                    
                    {selectedJob.lab_invoice_url && (
                      <Button
                        variant="outline"
                        onClick={() => setViewLabInvoiceOpen(true)}
                        data-testid="view-lab-invoice-button"
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Invoice
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Email Notifications Section - Admin Only */}
              {isAdmin && (
                <div className="space-y-3 border-t pt-4">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Notifications
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">Review & Send</Badge>
                  </Label>
                  <p className="text-sm text-navy-500">Send status update emails to the client. Review before sending.</p>
                  
                  {loadingNotifications ? (
                    <div className="flex items-center gap-2 text-navy-500 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading notifications...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notificationStatuses.filter(n => n.is_available).length === 0 ? (
                        <p className="text-sm text-navy-400 italic py-2">
                          No email notifications available for current status ({selectedJob.status.replace(/_/g, ' ')})
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {notificationStatuses.filter(n => n.is_available).map((notification) => (
                            <div
                              key={notification.type}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                notification.is_sent 
                                  ? 'bg-green-50 border-green-200' 
                                  : 'bg-amber-50 border-amber-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {notification.is_sent ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Clock className="h-4 w-4 text-amber-600" />
                                )}
                                <div>
                                  <p className="text-sm font-medium text-navy-800">
                                    {NOTIFICATION_LABELS[notification.type] || notification.type}
                                  </p>
                                  {notification.last_sent && (
                                    <p className="text-xs text-navy-500">
                                      Sent {new Date(notification.last_sent.sent_at).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant={notification.is_sent ? "outline" : "default"}
                                onClick={() => handlePreviewNotification(notification.type)}
                                className={notification.is_sent ? "" : "bg-navy-700 hover:bg-navy-600"}
                                data-testid={`preview-notification-${notification.type}`}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                {notification.is_sent ? 'Resend' : 'Review'}
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Stones Table with Certificate Grouping */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Gem className="h-4 w-4" />
                    Stones ({selectedJob.stones.length} total)
                  </Label>
                  <div className="flex items-center gap-2">
                    {editMode && isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddStoneDialogOpen(true)}
                        data-testid="add-stone-to-job-button"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Stone
                      </Button>
                    )}
                    {isAdmin && selectedStones.length >= 1 && areAllSelectedStonesGrouped() && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleUngroupStones}
                        disabled={savingGroup}
                        data-testid="ungroup-stones-button"
                        className="border-red-300 text-red-700 hover:bg-red-50"
                      >
                        {savingGroup ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4 mr-1" />
                        )}
                        Ungroup {selectedStones.length} Stone{selectedStones.length > 1 ? 's' : ''}
                      </Button>
                    )}
                    {isAdmin && selectedStones.length >= 2 && !anySelectedStoneGrouped() && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGroupDialogOpen(true)}
                        data-testid="group-stones-button"
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Group {selectedStones.length} Stones for Certificate
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Certificate Summary - only show if there are grouped stones */}
                {(() => {
                  const groups = organizeStonesIntoGroups(selectedJob.stones);
                  const groupedCerts = groups.filter(g => g.groupNumber !== null);
                  
                  if (groupedCerts.length > 0) {
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-amber-900">
                          <strong>Certificates:</strong>{' '}
                          {groupedCerts.map(g => `Cert ${g.groupNumber}: ${g.stones.length} stone${g.stones.length > 1 ? 's' : ''} (${g.label})`).join(', ')}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* Stones Table - Single table with visual grouping */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-navy-50">
                        <TableHead className="w-10">
                          <CheckSquare className="h-4 w-4 text-navy-500" />
                        </TableHead>
                        <TableHead className="text-navy-700">SKU</TableHead>
                        <TableHead className="text-navy-700">Type</TableHead>
                        <TableHead className="text-navy-700">Weight</TableHead>
                        <TableHead className="text-navy-700">Shape</TableHead>
                        <TableHead className="text-navy-700">Value</TableHead>
                        <TableHead className="text-navy-700">Fee</TableHead>
                        <TableHead className="text-navy-700 w-24">Certificate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Ungrouped stones first - simple list */}
                      {selectedJob.stones
                        .filter(s => !s.certificate_group)
                        .map((stone) => (
                          <TableRow 
                            key={stone.id}
                            className={`cursor-pointer hover:bg-navy-100 ${selectedStones.includes(stone.id) ? 'bg-navy-100' : ''}`}
                            onClick={() => openStoneDialog(stone)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedStones.includes(stone.id)}
                                onChange={() => toggleStoneSelection(stone.id)}
                                className="h-4 w-4 rounded border-navy-300"
                                data-testid={`select-stone-${stone.id}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{stone.sku}</TableCell>
                            <TableCell>{stone.stone_type}</TableCell>
                            <TableCell>{stone.weight} ct</TableCell>
                            <TableCell>{stone.shape}</TableCell>
                            <TableCell>${stone.value.toLocaleString()}</TableCell>
                            <TableCell>
                              <div>
                                <span>${stone.fee.toLocaleString()}</span>
                                {stone.actual_fee !== undefined && stone.actual_fee !== stone.fee && (
                                  <p className="text-xs text-green-600">Actual: ${stone.actual_fee.toLocaleString()}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {stone.certificate_scan_url ? (
                                <button
                                  onClick={() => {
                                    setViewingStone(stone);
                                    setViewCertScanOpen(true);
                                  }}
                                  className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50"
                                  title="View Certificate Scan"
                                  data-testid={`view-cert-${stone.id}`}
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-navy-400">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      
                      {/* Grouped stones with visual separation */}
                      {(() => {
                        const groupedStones = selectedJob.stones.filter(s => s.certificate_group);
                        const groups = new Map<number, Stone[]>();
                        groupedStones.forEach(s => {
                          const group = s.certificate_group!;
                          if (!groups.has(group)) groups.set(group, []);
                          groups.get(group)!.push(s);
                        });
                        
                        return Array.from(groups.entries())
                          .sort(([a], [b]) => a - b)
                          .map(([groupNum, stones]) => (
                            <React.Fragment key={groupNum}>
                              {/* Group header row - no hover effect */}
                              <TableRow className="bg-navy-800 hover:bg-navy-800">
                                <TableCell colSpan={8} className="py-2">
                                  <div className="flex items-center justify-between text-white">
                                    <span className="font-medium flex items-center gap-2">
                                      <Link2 className="h-4 w-4" />
                                      Certificate {groupNum} - {getCertificateLabel(stones.length)} ({stones.length} stone{stones.length > 1 ? 's' : ''})
                                    </span>
                                    <span className="text-sm opacity-80">
                                      Total: ${stones.reduce((sum, s) => sum + s.value, 0).toLocaleString()}
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                              {/* Stones in this group */}
                              {stones.map((stone) => (
                                <TableRow 
                                  key={stone.id}
                                  className={`cursor-pointer hover:bg-navy-100 ${selectedStones.includes(stone.id) ? 'bg-navy-100' : 'bg-navy-50/50'}`}
                                  onClick={() => openStoneDialog(stone)}
                                >
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={selectedStones.includes(stone.id)}
                                      onChange={() => toggleStoneSelection(stone.id)}
                                      className="h-4 w-4 rounded border-navy-300"
                                      data-testid={`select-stone-${stone.id}`}
                                    />
                                  </TableCell>
                                  <TableCell className="font-mono text-sm">{stone.sku}</TableCell>
                                  <TableCell>{stone.stone_type}</TableCell>
                                  <TableCell>{stone.weight} ct</TableCell>
                                  <TableCell>{stone.shape}</TableCell>
                                  <TableCell>${stone.value.toLocaleString()}</TableCell>
                                  <TableCell>
                                    <div>
                                      <span>${stone.fee.toLocaleString()}</span>
                                      {stone.actual_fee !== undefined && stone.actual_fee !== stone.fee && (
                                        <p className="text-xs text-green-600">Actual: ${stone.actual_fee.toLocaleString()}</p>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="bg-navy-100">Cert {groupNum}</Badge>
                                      {stone.certificate_scan_url && (
                                        <button
                                          onClick={() => {
                                            setViewingStone(stone);
                                            setViewCertScanOpen(true);
                                          }}
                                          className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50"
                                          title="View Certificate Scan"
                                          data-testid={`view-cert-${stone.id}`}
                                        >
                                          <FileText className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          ));
                      })()}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Stones for Certificate Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">Group Stones for Certificate</DialogTitle>
            <DialogDescription>
              Create a certificate group for {selectedStones.length} selected stone(s).
              Maximum 30 stones per certificate.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-navy-600">
              Selected stones will be grouped together and assigned to a single certificate.
            </p>
            {selectedStones.length > 30 && (
              <p className="text-sm text-red-600 mt-2">
                Warning: Maximum 30 stones per certificate. Please deselect some stones.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGroupStones}
              disabled={savingGroup || selectedStones.length === 0 || selectedStones.length > 30}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-group-button"
            >
              {savingGroup ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Grouping...
                </>
              ) : (
                'Create Certificate Group'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Stone Dialog */}
      <Dialog open={addStoneDialogOpen} onOpenChange={setAddStoneDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Stone to Job #{selectedJob?.job_number}</DialogTitle>
            <DialogDescription>
              Add a new stone to this job. Type, weight, and value are required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Stone Type <span className="text-red-500">*</span></Label>
              <Select
                value={newStone.stone_type}
                onValueChange={(value) => setNewStone({ ...newStone, stone_type: value })}
              >
                <SelectTrigger data-testid="add-stone-type-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {STONE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Weight (ct) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newStone.weight}
                  onChange={(e) => setNewStone({ ...newStone, weight: e.target.value })}
                  data-testid="add-stone-weight-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Value (USD) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newStone.value}
                  onChange={(e) => setNewStone({ ...newStone, value: e.target.value })}
                  data-testid="add-stone-value-input"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Shape</Label>
              <Select
                value={newStone.shape}
                onValueChange={(value) => setNewStone({ ...newStone, shape: value })}
              >
                <SelectTrigger data-testid="add-stone-shape-select">
                  <SelectValue placeholder="Select shape (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {SHAPES.map((shape) => (
                    <SelectItem key={shape} value={shape}>
                      {shape}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStoneDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStoneToJob}
              disabled={addingStone || !newStone.stone_type || !newStone.weight || !newStone.value}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-add-stone-button"
            >
              {addingStone ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Stone'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nested Stone Dialog - opens on top of job dialog */}
      <Dialog open={stoneDialogOpen} onOpenChange={setStoneDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
              <Diamond className="h-5 w-5" />
              Stone - {viewingStone?.sku}
              {isAdmin && (
                <Button
                  variant={verbalEditMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVerbalEditMode(!verbalEditMode)}
                  className={`ml-auto h-7 text-xs ${verbalEditMode ? 'bg-amber-600 hover:bg-amber-700' : 'border-navy-300 hover:bg-navy-100'}`}
                  data-testid="edit-stone-button"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {verbalEditMode ? 'Editing...' : 'Edit'}
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              Job #{selectedJob?.job_number} | {viewingStone?.stone_type} | {viewingStone?.weight} ct
            </DialogDescription>
          </DialogHeader>

          {viewingStone && (
            <div className="space-y-6 py-4">
              {/* Stone Info */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-navy-50 rounded-lg">
                <div>
                  <Label className="text-navy-500 text-xs">Type</Label>
                  <p className="font-medium text-navy-800">{viewingStone.stone_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Weight</Label>
                  <p className="font-medium text-navy-800">{viewingStone.weight} ct</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Shape</Label>
                  <p className="font-medium text-navy-800">{viewingStone.shape}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Value</Label>
                  <p className="font-medium text-navy-800">${viewingStone.value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Est. Fee</Label>
                  <p className="font-medium text-navy-800">${viewingStone.fee.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Actual Fee</Label>
                  {verbalEditMode ? (
                    <div className="flex items-center gap-1">
                      <span className="text-navy-600 text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={stoneActualFee}
                        onChange={(e) => setStoneActualFee(e.target.value)}
                        className="h-7 w-24 border-navy-200 text-sm font-medium"
                        data-testid="stone-actual-fee-input"
                      />
                    </div>
                  ) : (
                    <p className={`font-medium ${viewingStone.actual_fee !== undefined && viewingStone.actual_fee !== viewingStone.fee ? 'text-green-700' : 'text-navy-800'}`}>
                      ${(viewingStone.actual_fee ?? viewingStone.fee).toLocaleString()}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Color Stability</Label>
                  {verbalEditMode ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Switch
                        checked={stoneColorStability}
                        onCheckedChange={setStoneColorStability}
                        className="scale-75"
                        data-testid="stone-color-stability-switch"
                      />
                      <span className="text-xs text-navy-600">
                        {stoneColorStability ? '+$50' : 'No'}
                      </span>
                    </div>
                  ) : (
                    <p className="font-medium text-navy-800">
                      {viewingStone.color_stability_test ? 'Yes (+$50)' : 'No'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Certificate Group</Label>
                  <p className="font-medium text-navy-800">
                    {viewingStone.certificate_group ? `Group ${viewingStone.certificate_group}` : '-'}
                  </p>
                </div>
              </div>

              {/* Verbal Findings Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-navy-200 pb-2">
                  <Label className="text-lg font-semibold flex items-center gap-2 text-navy-800">
                    <FileText className="h-5 w-5" />
                    Verbal Findings
                  </Label>
                  {(() => {
                    const vf = viewingStone.verbal_findings;
                    const hasFindings = vf && typeof vf === 'object' && (vf as StructuredVerbalFindings).certificate_id;
                    return hasFindings ? <Badge variant="secondary" className="bg-green-100 text-green-800">Completed</Badge> : null;
                  })()}
                </div>
                
                {/* Lock indicator when not in edit mode */}
                {!verbalEditMode && isAdmin && (
                  <div className="bg-navy-50 border border-navy-200 rounded-md px-3 py-2 text-sm text-navy-600 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Click &quot;Edit&quot; to modify fees and verbal findings.
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Certificate ID */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">
                      Certificate ID <span className="text-red-500 font-bold">*</span>
                    </Label>
                    <Input
                      placeholder="Enter certificate ID..."
                      value={structuredFindings.certificate_id || ''}
                      onChange={(e) => setStructuredFindings(prev => ({ ...prev, certificate_id: e.target.value }))}
                      className={`border-navy-200 ${!verbalEditMode ? 'bg-gray-200 text-gray-600 cursor-not-allowed opacity-70' : 'bg-white'}`}
                      disabled={!verbalEditMode}
                      data-testid="verbal-certificate-id"
                    />
                    {verbalEditMode && !structuredFindings.certificate_id && (
                      <p className="text-xs text-red-500">Required field</p>
                    )}
                  </div>
                  
                  {/* Weight */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Weight (ct)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Weight..."
                      value={structuredFindings.weight || ''}
                      onChange={(e) => setStructuredFindings(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                      className={`border-navy-200 ${!verbalEditMode ? 'bg-gray-200 text-gray-600 cursor-not-allowed opacity-70' : 'bg-white'}`}
                      disabled={!verbalEditMode}
                      data-testid="verbal-weight"
                    />
                  </div>
                  
                  {/* Identification */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Identification</Label>
                    <SearchableSelect
                      value={structuredFindings.identification || ''}
                      onValueChange={(value) => setStructuredFindings(prev => ({ ...prev, identification: value }))}
                      disabled={!verbalEditMode}
                      options={dropdownSettings.identification.map(opt => ({ value: opt.value }))}
                      placeholder="Select identification..."
                      searchPlaceholder="Search identification..."
                      data-testid="verbal-identification"
                    />
                  </div>
                  
                  {/* Color */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Color</Label>
                    <SearchableSelect
                      value={structuredFindings.color || ''}
                      onValueChange={(value) => setStructuredFindings(prev => ({ ...prev, color: value }))}
                      disabled={!verbalEditMode}
                      options={dropdownSettings.color.map(opt => ({ value: opt.value }))}
                      placeholder="Select color..."
                      searchPlaceholder="Search color..."
                      data-testid="verbal-color"
                    />
                  </div>
                  
                  {/* Origin */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Origin</Label>
                    <SearchableSelect
                      value={structuredFindings.origin || ''}
                      onValueChange={(value) => setStructuredFindings(prev => ({ ...prev, origin: value }))}
                      disabled={!verbalEditMode}
                      options={dropdownSettings.origin.map(opt => ({ value: opt.value }))}
                      placeholder="Select origin..."
                      searchPlaceholder="Search origin..."
                      data-testid="verbal-origin"
                    />
                  </div>
                  
                  {/* Comment */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Comment</Label>
                    <SearchableSelect
                      value={structuredFindings.comment || ''}
                      onValueChange={(value) => setStructuredFindings(prev => ({ ...prev, comment: value }))}
                      disabled={!verbalEditMode}
                      options={dropdownSettings.comment.map(opt => ({ value: opt.value }))}
                      placeholder="Select comment..."
                      searchPlaceholder="Search comment..."
                      data-testid="verbal-comment"
                    />
                  </div>
                </div>
                
                {isAdmin && verbalEditMode && (
                <Button
                  onClick={async () => {
                    if (!viewingStone) return;
                    if (!structuredFindings.certificate_id) {
                      alert('Certificate ID is required');
                      return;
                    }
                    setSavingStoneVerbal(true);
                    try {
                      // Save verbal findings
                      await stonesApi.updateStructuredVerbal(viewingStone.id, structuredFindings);
                      
                      // Save fee changes if any
                      const newActualFee = stoneActualFee !== '' ? parseFloat(stoneActualFee) : undefined;
                      const hasActualFeeChange = newActualFee !== viewingStone.fee;
                      const hasColorStabilityChange = stoneColorStability !== viewingStone.color_stability_test;
                      
                      if (hasActualFeeChange || hasColorStabilityChange) {
                        const feeUpdateData: { actual_fee?: number; color_stability_test?: boolean } = {};
                        if (hasActualFeeChange && newActualFee !== undefined) {
                          feeUpdateData.actual_fee = newActualFee;
                        }
                        if (hasColorStabilityChange) {
                          feeUpdateData.color_stability_test = stoneColorStability;
                        }
                        await stonesApi.updateFees(viewingStone.id, feeUpdateData);
                      }
                      
                      // Update local state
                      const updatedStone = { 
                        ...viewingStone, 
                        verbal_findings: structuredFindings,
                        actual_fee: hasActualFeeChange ? newActualFee : viewingStone.actual_fee,
                        color_stability_test: hasColorStabilityChange ? stoneColorStability : viewingStone.color_stability_test
                      };
                      setViewingStone(updatedStone);
                      
                      if (selectedJob) {
                        const updatedStones = selectedJob.stones?.map(s => 
                          s.id === viewingStone.id ? updatedStone : s
                        );
                        setSelectedJob({ ...selectedJob, stones: updatedStones });
                      }
                      // Also update the main jobs list
                      fetchData();
                      // Lock the form after saving
                      setVerbalEditMode(false);
                    } catch (error) {
                      console.error('Failed to save:', error);
                      alert('Failed to save changes');
                    } finally {
                      setSavingStoneVerbal(false);
                    }
                  }}
                  disabled={savingStoneVerbal || !structuredFindings.certificate_id}
                  className="bg-navy-800 hover:bg-navy-700 w-full"
                  data-testid="save-stone-button"
                >
                  {savingStoneVerbal ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
                )}
              </div>

              {/* Certificate Scan */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Certificate Scan
                    {viewingStone.certificate_group && (
                      <Badge variant="outline" className="ml-2">
                        <Link2 className="h-3 w-3 mr-1" />
                        Group {viewingStone.certificate_group}
                      </Badge>
                    )}
                  </Label>
                  {viewingStone.certificate_scan_url && (
                    <Badge variant="success">Uploaded</Badge>
                  )}
                </div>
                
                {viewingStone.certificate_group && (
                  <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded">
                    This stone is part of Certificate Group {viewingStone.certificate_group}. 
                    Uploading a scan will apply to all stones in this group.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <input
                    ref={certScanInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !viewingStone || !selectedJob) return;

                      setUploadingCertScan(true);
                      try {
                        // Upload to Cloudinary
                        const folder = `certificates/${selectedJob.id}`;
                        const { url } = await cloudinaryApi.uploadFile(file, folder);
                        
                        if (viewingStone.certificate_group) {
                          await stonesApi.uploadGroupCertificateScan(
                            selectedJob.id,
                            viewingStone.certificate_group,
                            file.name,
                            url
                          );
                          // Update all stones in the group
                          const updatedStones = selectedJob.stones?.map(s => 
                            s.certificate_group === viewingStone.certificate_group
                              ? { ...s, certificate_scan_url: url }
                              : s
                          );
                          setSelectedJob({ ...selectedJob, stones: updatedStones });
                        } else {
                          await stonesApi.uploadCertificateScan(viewingStone.id, file.name, url);
                          const updatedStones = selectedJob.stones?.map(s => 
                            s.id === viewingStone.id ? { ...s, certificate_scan_url: url } : s
                          );
                          setSelectedJob({ ...selectedJob, stones: updatedStones });
                        }
                        
                        setViewingStone({ ...viewingStone, certificate_scan_url: url });
                        fetchData();
                      } catch (error) {
                        console.error('Failed to upload certificate scan:', error);
                        alert('Failed to upload certificate scan');
                      } finally {
                        setUploadingCertScan(false);
                      }
                      
                      if (certScanInputRef.current) {
                        certScanInputRef.current.value = '';
                      }
                    }}
                    className="hidden"
                    id="cert-upload-jobs"
                  />
                  {isAdmin && (
                  <Button
                    variant="outline"
                    onClick={() => certScanInputRef.current?.click()}
                    disabled={uploadingCertScan}
                    data-testid="upload-stone-cert-button"
                  >
                    {uploadingCertScan ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        {viewingStone.certificate_scan_url ? 'Replace Scan' : 'Upload Scan'}
                      </>
                    )}
                  </Button>
                  )}
                  
                  {viewingStone.certificate_scan_url && (
                    <Button
                      variant="outline"
                      onClick={() => setViewCertScanOpen(true)}
                      data-testid="view-stone-cert-button"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Scan
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStoneDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Certificate Scan Dialog */}
      <Dialog open={viewCertScanOpen} onOpenChange={setViewCertScanOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Certificate Scan - {viewingStone?.sku}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {viewingStone?.certificate_scan_url && (
              viewingStone.certificate_scan_url.startsWith('data:application/pdf') || 
              viewingStone.certificate_scan_url.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={viewingStone.certificate_scan_url}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '500px', maxHeight: '75vh' }}
                  title={`Certificate for ${viewingStone.sku}`}
                />
              ) : (
                <img
                  src={viewingStone.certificate_scan_url}
                  alt={`Certificate for ${viewingStone.sku}`}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewCertScanOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Memo Dialog */}
      <Dialog open={viewMemoOpen} onOpenChange={setViewMemoOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Signed Memo - Job #{selectedJob?.job_number}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {selectedJob?.signed_memo_url && (
              selectedJob.signed_memo_url.startsWith('data:application/pdf') || 
              selectedJob.signed_memo_url.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={selectedJob.signed_memo_url}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '500px', maxHeight: '75vh' }}
                  title={`Signed Memo for Job ${selectedJob.job_number}`}
                />
              ) : (
                <img
                  src={selectedJob.signed_memo_url}
                  alt={`Signed Memo for Job ${selectedJob.job_number}`}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewMemoOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Lab Invoice Dialog */}
      <Dialog open={viewLabInvoiceOpen} onOpenChange={setViewLabInvoiceOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Lab Invoice - Job #{selectedJob?.job_number}
              <Badge variant="secondary" className="bg-amber-100 text-amber-800">Admin Only</Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {selectedJob?.lab_invoice_url && (
              selectedJob.lab_invoice_url.startsWith('data:application/pdf') || 
              selectedJob.lab_invoice_url.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={selectedJob.lab_invoice_url}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '500px', maxHeight: '75vh' }}
                  title={`Lab Invoice for Job ${selectedJob.job_number}`}
                />
              ) : (
                <img
                  src={selectedJob.lab_invoice_url}
                  alt={`Lab Invoice for Job ${selectedJob.job_number}`}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewLabInvoiceOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Update Dialog */}
      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800">
              Update Job Status
            </DialogTitle>
            <DialogDescription>
              Update status for {selectedJobIds.length} selected job(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label className="text-navy-700 mb-2 block">New Status</Label>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger data-testid="bulk-status-select">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
                <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
                <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
                <SelectItem value="stones_returned">Stones Returned</SelectItem>
                <SelectItem value="cert_uploaded">Cert. Uploaded</SelectItem>
                <SelectItem value="cert_returned">Cert. Returned</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleBulkStatusUpdate}
              disabled={updatingBulkStatus || !bulkStatus}
              className="bg-navy-800 hover:bg-navy-700"
              data-testid="confirm-bulk-status-button"
            >
              {updatingBulkStatus ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Status'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Modal */}
      <Dialog open={previewModalOpen} onOpenChange={(open) => {
        setPreviewModalOpen(open);
        if (!open) {
          setNotificationPreview(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Review Email Before Sending
            </DialogTitle>
            <DialogDescription>
              Preview the email content before sending to the client.
            </DialogDescription>
          </DialogHeader>

          {loadingPreview ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
            </div>
          ) : notificationPreview ? (
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {/* Email Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-navy-50 rounded-lg">
                <div>
                  <Label className="text-navy-500 text-xs">To</Label>
                  <p className="font-medium text-navy-800">{notificationPreview.recipient_email}</p>
                  <p className="text-sm text-navy-600">{notificationPreview.recipient_name}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Job</Label>
                  <p className="font-medium text-navy-800">#{notificationPreview.job_number}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-navy-500 text-xs">Subject</Label>
                  <p className="font-medium text-navy-800">{notificationPreview.subject}</p>
                </div>
                {notificationPreview.attachments.length > 0 && (
                  <div className="col-span-2">
                    <Label className="text-navy-500 text-xs">Attachments</Label>
                    <div className="flex gap-2 mt-1">
                      {notificationPreview.attachments.map((att, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-blue-100 text-blue-800">
                          <FileText className="h-3 w-3 mr-1" />
                          {att.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Email Preview */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-navy-100 px-4 py-2 text-sm font-medium text-navy-700 border-b">
                  Email Preview
                </div>
                <div 
                  className="p-4 bg-white"
                  style={{ maxHeight: '400px', overflowY: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: notificationPreview.html_body }}
                />
              </div>

              {!notificationPreview.can_send && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-amber-800 text-sm">
                    <strong>Note:</strong> Email sending is not configured. The API key may be missing.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="border-t pt-4 mt-auto">
            <Button variant="outline" onClick={() => setPreviewModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendNotification}
              disabled={sendingEmail || !notificationPreview?.can_send}
              className="bg-green-600 hover:bg-green-700"
              data-testid="send-notification-button"
            >
              {sendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Client Invoice Dialog */}
      <Dialog open={viewInvoiceOpen} onOpenChange={setViewInvoiceOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Client Invoice - Job #{selectedJob?.job_number}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden" style={{ height: '70vh' }}>
            {selectedJob?.invoice_url && (
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(selectedJob.invoice_url)}&embedded=true`}
                className="w-full h-full border-0"
                title="Invoice PDF"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewInvoiceOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => window.open(selectedJob?.invoice_url, '_blank')}
              className="bg-navy-800 hover:bg-navy-700"
            >
              <FileText className="h-4 w-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
