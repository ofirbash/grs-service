"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { jobsApi, clientsApi, branchesApi, stonesApi, settingsApi, cloudinaryApi, notificationsApi, manualPaymentsApi } from '@/lib/api';
import { escapeHtml as esc, openPrintWindow } from '@/lib/sanitize';
import { useAuthStore, useBranchFilterStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

// Types, constants and sub-components extracted into sibling files
import type {
  StructuredVerbalFindings,
  Stone,
  DropdownSettings,
  Job,
  NotificationStatus,
  NotificationPreview,
  Client,
  Branch,
} from './_types';
import {
  DEFAULT_STONE_TYPES,
  DEFAULT_SHAPES,
  COMPANY_INFO,
  getCertificateLabel,
  organizeStonesIntoGroups,
} from './_helpers';
import { ShipmentChip } from './_components/ShipmentChip';
import { ManualPaymentDialog } from './_components/ManualPaymentDialog';
import { DocumentViewerDialog } from './_components/DocumentViewerDialog';
import { SmsPreviewDialog } from './_components/SmsPreviewDialog';
import { EmailPreviewDialog } from './_components/EmailPreviewDialog';
import { UnsavedChangesDialog, BulkStatusDialog, ClientInvoiceDialog } from './_components/MiscDialogs';
import { GroupStonesDialog, AddStoneDialog } from './_components/StoneDialogs';
import { CreateJobDialog } from './_components/CreateJobDialog';
import { JobSummaryGrid } from './_components/JobSummaryGrid';
import { JobPaymentCard } from './_components/JobPaymentCard';
import { JobNotificationsCard } from './_components/JobNotificationsCard';
import { StoneStatusBadges } from './_components/StoneStatusBadges';
import { JobDocumentsRow } from './_components/JobDocumentsRow';

/** Stable per-row UID for newly-created stone rows in the Create Job form.
 * Avoids using the array index as a React `key`, which loses focus + state when rows are removed. */
let _stoneUidCounter = 0;
const makeStoneUid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `stone-${Date.now()}-${++_stoneUidCounter}`;

export default function JobsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchFilterStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  // Read status filter from URL params
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam) {
      setStatusFilter(statusParam);
    }
  }, [searchParams]);
  const [serviceTypes, setServiceTypes] = useState<string[]>(['Express', 'Normal', 'Recheck']);
  const [paymentDestinations, setPaymentDestinations] = useState<string[]>([]);

  // Manual payment dialog state
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [manualPaymentAmount, setManualPaymentAmount] = useState('');
  const [manualPaymentDestination, setManualPaymentDestination] = useState('');
  const [manualPaymentNote, setManualPaymentNote] = useState('');
  const [manualPaymentNotifyEmail, setManualPaymentNotifyEmail] = useState(true);
  const [manualPaymentNotifySms, setManualPaymentNotifySms] = useState(true);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [lastPaymentResult, setLastPaymentResult] = useState<{ id: string; amount: number; balance: number; is_fully_paid: boolean; email_status?: string; sms_status?: string } | null>(null);
  const [stoneTypes, setStoneTypes] = useState<string[]>(DEFAULT_STONE_TYPES);
  const [shapes, setShapes] = useState<string[]>(DEFAULT_SHAPES);
  const [csFeeCost, setCsFeeCost] = useState(50);
  const [mountedFeeCost, setMountedFeeCost] = useState(50);
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
    _uid: string;
    stone_type: string;
    weight: string;
    shape: string;
    value: string;
    color_stability_test: boolean;
  }>>([{ _uid: makeStoneUid(), stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Check if form has any data (for unsaved changes warning)
  const hasUnsavedChanges = () => {
    const hasFormData = formData.client_id || formData.branch_id || formData.service_type || formData.notes;
    const hasStoneData = stones.some(s => s.stone_type || s.weight || s.value || s.shape);
    return hasFormData || hasStoneData;
  };

  // Check if form is valid for submission (all required fields filled)
  const isFormValid = (): boolean => {
    const hasRequiredFields = Boolean(formData.client_id && formData.branch_id && formData.service_type);
    const hasValidStone = stones.some(s => Boolean(s.stone_type && s.weight && s.value));
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
      setStones([{ _uid: makeStoneUid(), stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
    }
  };

  // View/Edit job dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editFormData, setEditFormData] = useState({
    notes: '',
    status: '',
    discount: '',
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
  const [unsavedConfirmOpen, setUnsavedConfirmOpen] = useState(false);
  const [savingStoneVerbal, setSavingStoneVerbal] = useState(false);
  const [uploadingCertScan, setUploadingCertScan] = useState(false);
  const [viewCertScanOpen, setViewCertScanOpen] = useState(false);
  const [verbalEditMode, setVerbalEditMode] = useState(false);
  const certScanInputRef = useRef<HTMLInputElement>(null);
  
  // Stone fee editing
  const [stoneColorStability, setStoneColorStability] = useState<boolean>(false);
  const [stoneMounted, setStoneMounted] = useState<boolean>(false);
  
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
  const [sendingSms, setSendingSms] = useState<string | null>(null);
  
  // Invoice generation
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [viewInvoiceOpen, setViewInvoiceOpen] = useState(false);
  
  // Payment link
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState(false);
  const [copiedPaymentLink, setCopiedPaymentLink] = useState(false);
  const [adjustmentMode, setAdjustmentMode] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [smsPreview, setSmsPreview] = useState<{ type: string; message: string; phone: string; name: string } | null>(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

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
        setEditFormData({ notes: job.notes || '', status: job.status, discount: job.discount != null ? String(job.discount) : '' });
        setViewDialogOpen(true);
        // Fetch notification statuses for admin users (parity with openViewDialog)
        if (user?.role === 'super_admin' || user?.role === 'branch_admin') {
          fetchNotificationStatuses(job.id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, jobs, user]);

  const fetchData = async () => {
    try {
      const branchParam = selectedBranchId ? { branch_id: selectedBranchId } : {};
      const [jobsData, clientsData, branchesData, dropdownData, pricingData] = await Promise.all([
        jobsApi.getAll(branchParam),
        clientsApi.getAll(selectedBranchId || undefined),
        branchesApi.getAll(),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
        settingsApi.getPricing().catch(() => ({ service_types: ['Express', 'Normal', 'Recheck'] })),
      ]);
      setJobs(jobsData);
      setClients(clientsData);
      setBranches(branchesData);
      setDropdownSettings(dropdownData);
      if (pricingData.service_types?.length) {
        setServiceTypes(pricingData.service_types);
      }
      if (pricingData.color_stability_fee != null) setCsFeeCost(pricingData.color_stability_fee);
      if (pricingData.mounted_jewellery_fee != null) setMountedFeeCost(pricingData.mounted_jewellery_fee);
      if (pricingData.stone_types?.length) setStoneTypes(pricingData.stone_types);
      if (pricingData.shapes?.length) setShapes(pricingData.shapes);
      if (pricingData.payment_destinations?.length) setPaymentDestinations(pricingData.payment_destinations);
      
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
    setStones([...stones, { _uid: makeStoneUid(), stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
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
  const handleDeleteStone = async (stoneId: string, sku: string) => {
    if (!selectedJob) return;
    if (!confirm(`Remove stone ${sku} from this job? This cannot be undone.`)) return;
    try {
      await jobsApi.deleteStone(selectedJob.id, stoneId);
      // Refresh job detail
      const updated = await jobsApi.getById(selectedJob.id);
      setSelectedJob(updated);
      // Refresh the list
      await fetchData();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed to remove stone');
    }
  };

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
    setStoneColorStability(stone.color_stability_test || false);
    setStoneMounted(stone.mounted || false);
    
    // Always start in locked mode - user must click "Edit" to modify
    setVerbalEditMode(false);
    
    setStoneDialogOpen(true);
  };

  const hasUnsavedStoneChanges = (): boolean => {
    if (!verbalEditMode || !viewingStone) return false;
    const hasColorStabilityChange = stoneColorStability !== viewingStone.color_stability_test;
    const hasMountedChange = stoneMounted !== (viewingStone.mounted || false);
    const hasVerbalData = structuredFindings.certificate_id || structuredFindings.identification || structuredFindings.color || structuredFindings.origin || structuredFindings.comment;
    const vf = viewingStone.verbal_findings;
    const existingFindings = (vf && typeof vf === 'object') ? vf as StructuredVerbalFindings : null;
    const hasVerbalChange = hasVerbalData && (
      structuredFindings.certificate_id !== (existingFindings?.certificate_id || '') ||
      structuredFindings.identification !== (existingFindings?.identification || '') ||
      structuredFindings.color !== (existingFindings?.color || '') ||
      structuredFindings.origin !== (existingFindings?.origin || '') ||
      structuredFindings.comment !== (existingFindings?.comment || '')
    );
    return hasColorStabilityChange || hasMountedChange || !!hasVerbalChange;
  };

  const handleStoneDialogClose = (open: boolean) => {
    if (!open && verbalEditMode && hasUnsavedStoneChanges()) {
      setUnsavedConfirmOpen(true);
      return;
    }
    setStoneDialogOpen(open);
  };

  const handleSaveStone = async () => {
    if (!viewingStone) return;
    setSavingStoneVerbal(true);
    try {
      const hasVerbalData = structuredFindings.certificate_id || structuredFindings.identification || structuredFindings.color || structuredFindings.origin || structuredFindings.comment;
      if (hasVerbalData) {
        await stonesApi.updateStructuredVerbal(viewingStone.id, structuredFindings);
      }
      const hasColorStabilityChange = stoneColorStability !== viewingStone.color_stability_test;
      const hasMountedChange = stoneMounted !== (viewingStone.mounted || false);
      if (hasColorStabilityChange || hasMountedChange) {
        const feeUpdateData: { color_stability_test?: boolean; mounted?: boolean } = {};
        if (hasColorStabilityChange) feeUpdateData.color_stability_test = stoneColorStability;
        if (hasMountedChange) feeUpdateData.mounted = stoneMounted;
        await stonesApi.updateFees(viewingStone.id, feeUpdateData);
      }
      if (selectedJob) {
        const refreshedJob = await jobsApi.getById(selectedJob.id);
        setSelectedJob(refreshedJob);
        const refreshedStone = refreshedJob.stones?.find((s: Stone) => s.id === viewingStone.id);
        if (refreshedStone) {
          setViewingStone(refreshedStone);
          setStoneColorStability(refreshedStone.color_stability_test || false);
          setStoneMounted(refreshedStone.mounted || false);
        }
      }
      fetchData();
      setVerbalEditMode(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes');
    } finally {
      setSavingStoneVerbal(false);
    }
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
      setStones([{ _uid: makeStoneUid(), stone_type: '', weight: '', shape: '', value: '', color_stability_test: false }]);
      setValidationErrors([]);
      fetchData();
    } catch (error) {
      console.error('Failed to create job:', error);
      setValidationErrors(['Failed to create job. Please try again.']);
    } finally {
      setCreating(false);
    }
  };

  const filteredJobs = useMemo(
    () => jobs.filter((job) => {
      const matchesSearch =
        job.job_number.toString().includes(searchTerm) ||
        job.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
      // 'active' = everything except done + cancelled (default view)
      // 'all'    = everything including done + cancelled
      // any other value = exact status match
      let matchesStatus: boolean;
      if (statusFilter === 'active') {
        matchesStatus = job.status !== 'done' && job.status !== 'cancelled';
      } else if (statusFilter === 'all') {
        matchesStatus = true;
      } else {
        matchesStatus = job.status === statusFilter;
      }
      return matchesSearch && matchesStatus;
    }),
    [jobs, searchTerm, statusFilter],
  );

  // Memoised derivations of the currently-open job's stones.
  // Without useMemo these recompute on every keystroke in the dialog body.
  const selectedJobStoneGroups = useMemo(
    () => (selectedJob ? organizeStonesIntoGroups(selectedJob.stones) : []),
    [selectedJob],
  );
  const selectedJobUngroupedStones = useMemo(
    () => (selectedJob ? selectedJob.stones.filter((s) => !s.certificate_group) : []),
    [selectedJob],
  );

  const openJobDetails = (job: Job) => {
    setSelectedJob(job);
    setEditFormData({
      notes: job.notes || '',
      status: job.status,
      discount: job.discount != null ? String(job.discount) : '',
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
        discount: editFormData.discount !== '' ? parseFloat(editFormData.discount) : 0,
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
    // Lookup full client & branch details from loaded state
    const clientFull = clients.find((c) => c.id === job.client_id);
    const branchFull = branches.find((b) => b.id === job.branch_id);

    // Determine doc title based on status
    const docTitle =
      job.status === 'draft' || job.status === 'pending_stones'
        ? 'Intake Receipt / Memo'
        : job.status === 'cert_issued' || job.status === 'done'
        ? 'Completion Memo'
        : 'Job Memo';

    // Separate ungrouped and grouped stones
    const ungroupedStones = job.stones.filter((s) => !s.certificate_group);
    const groupedStonesMap = new Map<number, Stone[]>();
    job.stones
      .filter((s) => s.certificate_group)
      .forEach((s) => {
        const group = s.certificate_group!;
        if (!groupedStonesMap.has(group)) groupedStonesMap.set(group, []);
        groupedStonesMap.get(group)!.push(s);
      });

    // Build human-friendly labels per group: pair-1, pair-2, layout-1, single-1, multi-stone-1
    const labelKey = (count: number): string => {
      if (count === 1) return 'single';
      if (count === 2) return 'pair';
      if (count >= 3 && count <= 6) return 'layout';
      return 'multi-stone';
    };
    const sortedGroups = Array.from(groupedStonesMap.entries()).sort(([a], [b]) => a - b);
    const groupLabels = new Map<number, string>();
    const typeCounters: Record<string, number> = {};
    sortedGroups.forEach(([groupNum, stones]) => {
      const key = labelKey(stones.length);
      typeCounters[key] = (typeCounters[key] || 0) + 1;
      groupLabels.set(groupNum, `${key}-${typeCounters[key]}`);
    });

    // Total Certificates = number of groups + each ungrouped stone (one cert each)
    const totalCertificates = groupedStonesMap.size + ungroupedStones.length;

    // Build stone rows with CS + Mounted flags (with 2-decimal value/fee for clarity)
    const fmt = (n: number): string => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const stoneRow = (index: number, stone: Stone, isGrouped: boolean) => {
      const flags: string[] = [];
      if (stone.color_stability_test) flags.push('CS');
      if (stone.mounted) flags.push('Mtd');
      const flagsStr = flags.length > 0 ? flags.join(', ') : '—';
      return `
        <tr class="${isGrouped ? 'grouped-row' : ''}">
          <td>${index}</td>
          <td>${esc(stone.sku)}</td>
          <td>${esc(stone.stone_type)}</td>
          <td>${esc(String(stone.weight))} ct</td>
          <td>${esc(stone.shape)}</td>
          <td class="flags">${flagsStr}</td>
          <td>$${fmt(stone.value || 0)}</td>
          <td>$${fmt(stone.fee || 0)}</td>
        </tr>
      `;
    };

    let rowIndex = 1;
    const ungroupedRows = ungroupedStones
      .map((stone) => stoneRow(rowIndex++, stone, false))
      .join('');

    const groupedRows = sortedGroups
      .map(([groupNum, stones]) => {
        const label = groupLabels.get(groupNum) || 'group';
        const groupHeader = `
          <tr class="group-separator">
            <td colspan="8">
              <strong>${label}</strong> (${stones.length} stone${stones.length > 1 ? 's' : ''})
            </td>
          </tr>
        `;
        const stoneRows = stones
          .map((stone) => stoneRow(rowIndex++, stone, true))
          .join('');
        return groupHeader + stoneRows;
      })
      .join('');

    const subtotal = (job.total_fee || 0) + (job.discount || 0);
    const hasDiscount = (job.discount || 0) > 0;

    // Totals for the table footer row (no black bg, per spec).
    const totalWeight = job.stones.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    const totalValueAll = job.stones.reduce((sum, s) => sum + (s.value || 0), 0);
    const totalFeeAll = job.stones.reduce((sum, s) => sum + (s.fee || 0), 0);
    const totalStonesCount = job.stones.length;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const absoluteLogo = COMPANY_INFO.logoUrl.startsWith('http')
      ? COMPANY_INFO.logoUrl
      : origin + COMPANY_INFO.logoUrl;

    const formattedDate = new Date(job.created_at).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const formattedPrintedAt = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Job #${job.job_number} — ${COMPANY_INFO.displayName}</title>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 22px 32px; max-width: 900px; margin: 0 auto; color: #141417; line-height: 1.4; }
          .company-header { display: flex; justify-content: flex-start; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #141417; }
          .company-brand { display: flex; gap: 12px; align-items: center; }
          .company-brand img { width: 44px; height: 44px; object-fit: contain; border: 1px solid #e5e5e5; border-radius: 6px; padding: 2px; background: #ffffff; }
          .company-brand .name-block { display: flex; flex-direction: column; }
          .company-brand .display-name { font-size: 18px; font-weight: 700; color: #141417; }
          .company-brand .legal-name { font-size: 10px; color: #71717a; }
          .doc-title-bar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
          .doc-title-bar h1 { margin: 0; font-size: 18px; color: #141417; letter-spacing: 0.5px; }
          .doc-title-bar .job-number { font-size: 13px; font-weight: 600; color: #3f3f46; }
          .job-meta-row { display: flex; flex-wrap: wrap; gap: 18px; padding: 10px 14px; background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 6px; margin-bottom: 14px; }
          .job-meta-row .cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
          .job-meta-row .cell.flex1 { flex: 1; }
          .job-meta-row .meta-label { font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.6px; }
          .job-meta-row .meta-value { font-size: 12px; font-weight: 600; color: #141417; line-height: 1.4; }
          .job-meta-row .meta-value .sub { font-weight: 400; color: #3f3f46; font-size: 11px; }
          .section { margin: 12px 0; }
          .section h3 { margin: 0 0 6px 0; color: #141417; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          th, td { border: 1px solid #e5e5e5; padding: 5px 7px; text-align: left; font-size: 10.5px; }
          th { background: #ffffff; color: #141417; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 9.5px; border-bottom: 2px solid #141417; }
          tr:nth-child(even):not(.group-separator):not(.grouped-row):not(.totals-row) { background: #fafafa; }
          .group-separator { background: #1e1e22 !important; color: #ffffff; }
          .group-separator td { padding: 4px 7px; border-color: #1e1e22; font-size: 10.5px; text-transform: lowercase; letter-spacing: 0.3px; }
          .group-separator strong { color: #ffffff; font-weight: 700; text-transform: lowercase; }
          .grouped-row { background: #fafafa; }
          .flags { font-weight: 600; color: #141417; font-size: 10px; text-align: center; }
          .totals-row td { background: #f5f5f5; border-top: 2px solid #141417; font-weight: 700; color: #141417; }
          .terms { margin: 14px 0 10px; padding: 10px 14px; border: 1px solid #e5e5e5; border-radius: 6px; background: #fafafa; }
          .terms h3 { margin: 0 0 5px 0; color: #141417; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
          .terms p { color: #3f3f46; font-size: 9.5px; line-height: 1.5; margin: 2px 0; }
          .terms-hebrew { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #d4d4d8; direction: rtl; text-align: right; }
          .terms-hebrew p { font-size: 9.5px; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 18px 0 8px; }
          .sig-block p { margin: 0 0 18px 0; color: #141417; font-size: 11px; font-weight: 600; }
          .sig-line { border-bottom: 1px solid #141417; height: 30px; }
          .sig-caption { margin-top: 3px; font-size: 9.5px; color: #a1a1aa; }
          .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e5e5; text-align: center; color: #71717a; font-size: 9.5px; line-height: 1.5; }
          .footer strong { color: #3f3f46; }
          @media print {
            body { padding: 14px 20px; }
            .page-break { page-break-before: always; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="company-header">
          <div class="company-brand">
            <img src="${absoluteLogo}" alt="${COMPANY_INFO.displayName}" onerror="this.style.display='none'" />
            <div class="name-block">
              <span class="display-name">${COMPANY_INFO.displayName}</span>
              <span class="legal-name">${COMPANY_INFO.legalName}</span>
            </div>
          </div>
        </div>

        <div class="doc-title-bar">
          <h1>${docTitle}</h1>
          <div class="job-number">Job #${job.job_number} · ${formattedDate}</div>
        </div>

        <div class="job-meta-row">
          <div class="cell flex1">
            <span class="meta-label">Client</span>
            <span class="meta-value">
              ${esc(clientFull?.name || job.client_name || 'N/A')}
              ${clientFull?.email ? `<span class="sub"> · ${esc(clientFull.email)}</span>` : ''}
              ${clientFull?.phone ? `<span class="sub"> · ${esc(clientFull.phone)}</span>` : ''}
            </span>
          </div>
          <div class="cell">
            <span class="meta-label">Service Type</span>
            <span class="meta-value">${esc(job.service_type)}</span>
          </div>
        </div>

        <div class="section">
          <h3>Stones</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 28px;">#</th>
                <th>SKU</th>
                <th>Type</th>
                <th>Weight</th>
                <th>Shape</th>
                <th style="width: 70px; text-align: center;">Flags</th>
                <th>Value</th>
                <th>Fee</th>
              </tr>
            </thead>
            <tbody>
              ${ungroupedRows}
              ${groupedRows}
            </tbody>
            <tfoot>
              <tr class="totals-row">
                <td colspan="3"><strong>Total — ${totalStonesCount} stone${totalStonesCount === 1 ? '' : 's'} · ${totalCertificates} certificate${totalCertificates === 1 ? '' : 's'}</strong></td>
                <td><strong>${totalWeight.toFixed(2)} ct</strong></td>
                <td></td>
                <td></td>
                <td><strong>$${fmt(totalValueAll)}</strong></td>
                <td><strong>$${fmt(totalFeeAll)}</strong></td>
              </tr>
            </tfoot>
          </table>
          <div style="font-size: 9.5px; color: #a1a1aa; margin-top: 4px;">Flags: CS = Color Stability Test · Mtd = Mounted in jewellery</div>
          ${
            hasDiscount
              ? `<div style="margin-top:8px;font-size:11px;color:#3f3f46;text-align:right;">
                  Subtotal $${fmt(subtotal)} · <span style="color:#c2410c;">Discount &minus;$${fmt(job.discount || 0)}</span> · <strong style="color:#141417;">Total Fee $${fmt(job.total_fee || 0)}</strong>
                </div>`
              : ''
          }
        </div>

        ${
          job.notes
            ? `<div class="section"><h3>Notes</h3><p style="font-size:11px;color:#3f3f46;margin:0;">${esc(job.notes)}</p></div>`
            : ''
        }

        <div class="terms">
          <h3>Terms & Conditions</h3>
          <p>The customer agrees to pay the above fees immediately upon delivery of the goods, unconditional of results.</p>
          <p>Refusal of payment will justify the non-return of goods to the customer.</p>
          <p>The fees above are an estimated cost of certificates based on details supplied by the customer. The lab will determine the final fees after the inspection of the goods.</p>
          ${
            (branchFull?.name || job.branch_name || '').toLowerCase().includes('israel')
              ? `<div class="terms-hebrew">
                  <p>הלקוח מתחייב לשלם את העלויות הנקובות לעיל מיד עם מסירת הטובין ללא תלות בתוצאות המעבדה</p>
                  <p>סירוב לשלם את העלויות הנ"ל תהיה עילה מוצדקת לאי החזרת הטובין ללקוח</p>
                  <p>העלויות לעיל הינן הערכה של עלויות התעודות בהתבסס על הנתונים שנמסרו ע"י הלקוח.</p>
                  <p>המחיר הסופי ייקבע ע"י המעבדה לאחר בחינה של הטובין והערכת שוויים</p>
                </div>`
              : ''
          }
        </div>

        <div class="signatures">
          <div class="sig-block">
            <p>Client Signature</p>
            <div class="sig-line"></div>
            <div class="sig-caption">Date: ____________________</div>
          </div>
          <div class="sig-block">
            <p>Lab Representative</p>
            <div class="sig-line"></div>
            <div class="sig-caption">Date: ____________________</div>
          </div>
        </div>

        <div class="footer">
          <div><strong>${COMPANY_INFO.legalName}</strong> · ${COMPANY_INFO.address}</div>
          <div>${COMPANY_INFO.phones.join(' · ')} · ${COMPANY_INFO.email} · VAT ${COMPANY_INFO.vat}</div>
          <div style="margin-top:4px;">Printed ${formattedPrintedAt}</div>
        </div>

        <script>
          // Wait for logo to load, then print
          window.addEventListener('load', function() {
            setTimeout(function() { window.print(); }, 200);
          });
        </script>
      </body>
      </html>
    `;
    const printWindow = openPrintWindow(html);
    if (!printWindow) {
      alert('Please allow popups to print');
    }
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

  const handleSendSms = async (notificationType: string) => {
    if (!selectedJob) return;
    setSendingSms(notificationType);
    try {
      // Preview first
      const preview = await notificationsApi.previewSms(selectedJob.id, notificationType);
      setSmsPreview({
        type: notificationType,
        message: preview.message,
        phone: preview.recipient_phone,
        name: preview.recipient_name,
      });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to preview SMS.');
    } finally {
      setSendingSms(null);
    }
  };

  const handleConfirmSendSms = async () => {
    if (!selectedJob || !smsPreview) return;
    setSendingSms(smsPreview.type);
    try {
      const result = await notificationsApi.sendSms(selectedJob.id, smsPreview.type);
      alert(`SMS sent to ${result.recipient_phone}`);
      fetchNotificationStatuses(selectedJob.id);
      setSmsPreview(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err.response?.data?.detail || 'Failed to send SMS.');
    } finally {
      setSendingSms(null);
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

  const openManualPaymentDialog = () => {
    if (!selectedJob) return;
    const net = Math.max(0, (selectedJob.total_fee || 0) - (selectedJob.discount || 0));
    const paid = (selectedJob.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    const balance = Math.max(0, net - paid);
    setManualPaymentAmount(balance.toFixed(2));
    setManualPaymentDestination(paymentDestinations[0] || '');
    setManualPaymentNote('');
    setManualPaymentNotifyEmail(true);
    setManualPaymentNotifySms(true);
    setLastPaymentResult(null);
    setManualPaymentOpen(true);
  };

  const handleRecordManualPayment = async () => {
    if (!selectedJob) return;
    const amt = parseFloat(manualPaymentAmount);
    if (!amt || amt <= 0) { alert('Enter an amount greater than 0'); return; }
    if (!manualPaymentDestination) { alert('Please pick a destination'); return; }

    setRecordingPayment(true);
    try {
      const res = await manualPaymentsApi.record(selectedJob.id, {
        amount: amt,
        destination: manualPaymentDestination,
        note: manualPaymentNote,
        notify_email: manualPaymentNotifyEmail,
        notify_sms: manualPaymentNotifySms,
      });
      setLastPaymentResult({
        id: res.payment.id,
        amount: res.payment.amount,
        balance: res.balance,
        is_fully_paid: res.balance === 0,
        email_status: res.notifications?.email?.status,
        sms_status: res.notifications?.sms?.status,
      });
      // Refresh job detail + list
      const updated = await jobsApi.getById(selectedJob.id);
      setSelectedJob(updated);
      await fetchData();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleGeneratePaymentLink = async (isAdjustment = false) => {
    if (!selectedJob) return;
    setGeneratingPaymentLink(true);
    try {
      let result;
      if (isAdjustment && adjustmentAmount) {
        result = await jobsApi.generatePaymentToken(selectedJob.id, {
          is_adjustment: true,
          adjustment_amount: parseFloat(adjustmentAmount),
        });
        setAdjustmentMode(false);
        setAdjustmentAmount('');
      } else {
        result = await jobsApi.generatePaymentToken(selectedJob.id);
      }
      setSelectedJob(prev => prev ? { ...prev, payment_token: result.payment_token, payment_url: result.payment_url, payment_status: isAdjustment ? 'pending' : prev.payment_status } : null);
      fetchData();
    } catch (error) {
      console.error('Failed to generate payment link:', error);
    } finally {
      setGeneratingPaymentLink(false);
    }
  };

  const handleCopyPaymentLink = () => {
    if (!selectedJob?.payment_url) return;
    navigator.clipboard.writeText(selectedJob.payment_url);
    setCopiedPaymentLink(true);
    setTimeout(() => setCopiedPaymentLink(false), 2000);
  };

  const toggleStoneSelection = (stoneId: string) => {
    setSelectedStones(prev => 
      prev.includes(stoneId) 
        ? prev.filter(id => id !== stoneId)
        : [...prev, stoneId]
    );
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-[#d4dbe4] text-[#486581]',
      stones_accepted: 'bg-[#b8c5d4] text-[#243b53]',
      sent_to_lab: 'bg-[#8da2b8] text-white',
      verbal_uploaded: 'bg-[#6b8aaa] text-white',
      stones_returned: 'bg-[#4a7191] text-white',
      cert_uploaded: 'bg-[#305a78] text-white',
      cert_returned: 'bg-[#1d3f57] text-white',
      done: 'bg-[#c53030] text-white',
      cancelled: 'bg-[#52525b] text-white line-through',
      received: 'bg-[#d4dbe4] text-[#486581]',
      certificates_scanned: 'bg-[#305a78] text-white',
      certificates_sent: 'bg-[#1d3f57] text-white',
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
      cancelled: 'Cancelled',
      received: 'Draft',
      certificates_scanned: 'Cert. Uploaded',
      certificates_sent: 'Cert. Returned',
    };
    return <Badge className={styles[status] || 'bg-navy-100 text-navy-600 border-navy-200'}>{labels[status] || status.replace('_', ' ')}</Badge>;
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
            className="bg-navy-900 hover:bg-navy-800"
            data-testid="create-job-button"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Job
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="border-navy-200">
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
                <SelectItem value="active">Active (hide Done & Cancelled)</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
                <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
                <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
                <SelectItem value="stones_returned">Stones Returned</SelectItem>
                <SelectItem value="cert_uploaded">Cert. Uploaded</SelectItem>
                <SelectItem value="cert_returned">Cert. Returned</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card className="border-navy-200">
        <CardHeader className="border-b border-navy-200">
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
            <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2 p-3">
              {filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className="border border-navy-200 rounded-lg p-3 hover:bg-navy-50 cursor-pointer active:bg-navy-100"
                  onClick={() => openJobDetails(job)}
                  data-testid={`job-card-${job.job_number}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-navy-900">#{job.job_number}</span>
                    {getStatusBadge(job.status)}
                  </div>
                  <div className="text-sm text-navy-600 mb-1">{job.client_name || 'N/A'} &middot; {job.branch_name || 'N/A'}</div>
                  <div className="flex items-center justify-between text-xs text-navy-500">
                    <span>{job.total_stones} stones &middot; {job.service_type}</span>
                    <div className="text-right">
                      <span className="font-medium text-navy-900">${job.total_fee.toLocaleString()}</span>
                      {job.discount ? (
                        <p className="text-[10px] text-emerald-600 font-medium">${Math.max(0, job.total_fee - job.discount).toLocaleString()}</p>
                      ) : null}
                    </div>
                  </div>
                  {job.payment_status === 'paid' && (
                    <div className="mt-1.5"><Badge className="bg-navy-900 text-white text-[10px]">Paid</Badge></div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="bg-navy-50">
                    {isAdmin && (
                      <TableHead className="font-semibold text-navy-700 w-10 px-2">
                        <input
                          type="checkbox"
                          checked={filteredJobs.length > 0 && selectedJobIds.length === filteredJobs.length}
                          onChange={selectAllJobs}
                          className="h-4 w-4 rounded border-navy-300"
                          data-testid="select-all-jobs"
                        />
                      </TableHead>
                    )}
                    <TableHead className="font-semibold text-navy-700 w-16">Job #</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-40">Client</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-20">Service</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-14 text-center">Stones</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-28">Value / Fee</TableHead>
                    <TableHead className="font-semibold text-navy-700 w-32">Status</TableHead>
                    {isAdmin && <TableHead className="font-semibold text-navy-700 w-20">Payment</TableHead>}
                    <TableHead className="font-semibold text-navy-700 w-36">Shipment</TableHead>
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
                        <TableCell onClick={(e) => e.stopPropagation()} className="px-2">
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
                        className="font-semibold text-navy-900"
                        onClick={() => openJobDetails(job)}
                      >
                        #{job.job_number}
                      </TableCell>
                      <TableCell className="text-navy-600 truncate" onClick={() => openJobDetails(job)}>
                        <div className="truncate font-medium text-navy-900">{job.client_name || 'N/A'}</div>
                        <div className="truncate text-[11px] text-navy-500">{job.branch_name || '—'}</div>
                      </TableCell>
                      <TableCell className="text-navy-600 truncate" onClick={() => openJobDetails(job)}>
                        {job.service_type}
                      </TableCell>
                      <TableCell className="text-navy-600 text-center" onClick={() => openJobDetails(job)}>
                        {job.total_stones}
                      </TableCell>
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        <div className="leading-tight">
                          <div className="text-[11px] text-navy-500">${job.total_value.toLocaleString()}</div>
                          <div className="font-semibold text-navy-900">${job.total_fee.toLocaleString()}</div>
                          {job.discount ? (
                            <div className="text-[10px] text-emerald-600 font-medium">net ${Math.max(0, job.total_fee - job.discount).toLocaleString()}</div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell onClick={() => openJobDetails(job)}>
                        {getStatusBadge(job.status)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell onClick={() => openJobDetails(job)}>
                          {job.payment_status === 'paid' ? (
                            <Badge className="bg-navy-900 text-white text-xs">Paid</Badge>
                          ) : job.payment_token ? (
                            <Badge variant="outline" className="text-navy-600 border-navy-300 text-xs">Pending</Badge>
                          ) : (
                            <span className="text-navy-400 text-xs">-</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-navy-600" onClick={() => openJobDetails(job)}>
                        {job.shipment_info ? (
                          <ShipmentChip info={job.shipment_info} compact />
                        ) : (
                          <span className="text-navy-300">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Job Dialog */}
      <CreateJobDialog
        open={createDialogOpen}
        onOpenChange={handleCreateDialogClose}
        validationErrors={validationErrors}
        formData={formData}
        setFormData={setFormData}
        clients={clients}
        branches={branches}
        serviceTypes={serviceTypes}
        stoneTypes={stoneTypes}
        shapes={shapes}
        stones={stones}
        onStoneChange={(index, field, value) => handleStoneChange(index, field, value)}
        onAddStone={handleAddStone}
        onRemoveStone={handleRemoveStone}
        creating={creating}
        isFormValid={isFormValid}
        onSubmit={handleCreateJob}
      />

      {/* View Job Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={(open) => {
        setViewDialogOpen(open);
        if (!open) {
          setEditMode(false);
          setSelectedStones([]);
        }
      }}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] p-0 !overflow-x-hidden flex flex-col">
          <DialogHeader className="bg-white border-b px-6 py-4 shrink-0">
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

          <div className="px-6 pb-6 flex-1 overflow-y-auto">
          {selectedJob && (
            <div className="space-y-4 py-4">
              {/* Job Summary + Notes */}
              <JobSummaryGrid
                job={selectedJob}
                editMode={editMode}
                editFormData={editFormData}
                setEditFormData={setEditFormData}
                getStatusBadge={getStatusBadge}
              />

              {/* Two-column layout: Stones (left) + Actions sidebar (right) */}
              <div className="space-y-4 border-t pt-4">
                {/* Stones Table */}
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
                  const groups = selectedJobStoneGroups;
                  const groupedCerts = groups.filter(g => g.groupNumber !== null);
                  
                  if (groupedCerts.length > 0) {
                    return (
                      <div className="bg-navy-50 border border-navy-200 rounded-lg p-3">
                        <p className="text-sm font-medium text-navy-900">
                          <strong>Certificates:</strong>{' '}
                          {groupedCerts.map(g => `Cert ${g.groupNumber}: ${g.stones.length} stone${g.stones.length > 1 ? 's' : ''} (${g.label})`).join(', ')}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
                
                {/* Stones - Mobile Cards */}
                <div className="md:hidden space-y-2">
                  {selectedJob.stones.map((stone) => (
                    <div
                      key={stone.id}
                      className="border border-navy-200 rounded-lg p-2.5 active:bg-navy-50 relative"
                      onClick={() => openStoneDialog(stone)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-navy-900">{stone.sku}</span>
                        <StoneStatusBadges stone={stone} />
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-navy-900">${stone.fee.toLocaleString()}</span>
                          {isAdmin && editMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteStone(stone.id, stone.sku); }}
                              className="text-red-500 p-1 -mr-1 rounded active:bg-red-50"
                              title="Remove stone"
                              data-testid={`delete-stone-mobile-${stone.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-navy-500 mt-0.5">{stone.stone_type} &middot; {stone.weight} ct &middot; {stone.shape}</div>
                      {stone.certificate_group && <Badge variant="outline" className="text-[10px] mt-1">Cert {stone.certificate_group}</Badge>}
                    </div>
                  ))}
                </div>

                {/* Stones Table - Desktop */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table className="table-fixed w-full">
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
                        {editMode && isAdmin && <TableHead className="text-navy-700 w-10"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Ungrouped stones first - simple list */}
                      {selectedJobUngroupedStones
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
                            <TableCell className="font-mono text-sm">{stone.sku}<StoneStatusBadges stone={stone} /></TableCell>
                            <TableCell>{stone.stone_type}</TableCell>
                            <TableCell>{stone.weight} ct</TableCell>
                            <TableCell>{stone.shape}</TableCell>
                            <TableCell>${stone.value.toLocaleString()}</TableCell>
                            <TableCell>
                              <span>${stone.fee.toLocaleString()}</span>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {stone.certificate_scan_url ? (
                                <button
                                  onClick={() => {
                                    setViewingStone(stone);
                                    setViewCertScanOpen(true);
                                  }}
                                  className="text-navy-600 hover:text-navy-900 p-1 rounded hover:bg-navy-50"
                                  title="View Certificate Scan"
                                  data-testid={`view-cert-${stone.id}`}
                                >
                                  <FileText className="h-4 w-4" />
                                </button>
                              ) : (
                                <span className="text-navy-400">-</span>
                              )}
                            </TableCell>
                            {editMode && isAdmin && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleDeleteStone(stone.id, stone.sku)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                  title="Remove stone from job"
                                  data-testid={`delete-stone-${stone.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            )}
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
                                <TableCell colSpan={editMode && isAdmin ? 9 : 8} className="py-2">
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
                                  <TableCell className="font-mono text-sm">{stone.sku}<StoneStatusBadges stone={stone} /></TableCell>
                                  <TableCell>{stone.stone_type}</TableCell>
                                  <TableCell>{stone.weight} ct</TableCell>
                                  <TableCell>{stone.shape}</TableCell>
                                  <TableCell>${stone.value.toLocaleString()}</TableCell>
                                  <TableCell>
                                    <span>${stone.fee.toLocaleString()}</span>
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
                                          className="text-navy-600 hover:text-navy-900 p-1 rounded hover:bg-navy-50"
                                          title="View Certificate Scan"
                                          data-testid={`view-cert-${stone.id}`}
                                        >
                                          <FileText className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  </TableCell>
                                  {editMode && isAdmin && (
                                    <TableCell onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => handleDeleteStone(stone.id, stone.sku)}
                                        className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                        title="Remove stone from job"
                                        data-testid={`delete-stone-${stone.id}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </React.Fragment>
                          ));
                      })()}
                    </TableBody>
                  </Table>
                </div>

                {/* Actions */}
                <div className="border-t border-navy-200 pt-4 mt-4">
                  <Label className="text-sm font-semibold text-navy-700 mb-3 block">Actions</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Signed Memo + Client Invoice + Lab Invoice */}
                  <JobDocumentsRow
                    job={selectedJob}
                    isAdmin={isAdmin}
                    memoInputRef={fileInputRef}
                    uploadingMemo={uploading}
                    onMemoChange={handleMemoUpload}
                    onViewMemo={() => setViewMemoOpen(true)}
                    generatingInvoice={generatingInvoice}
                    onGenerateInvoice={handleGenerateInvoice}
                    onViewInvoice={() => setViewInvoiceOpen(true)}
                    labInvoiceInputRef={labInvoiceInputRef}
                    uploadingLabInvoice={uploadingLabInvoice}
                    onLabInvoiceChange={handleLabInvoiceUpload}
                    onViewLabInvoice={() => setViewLabInvoiceOpen(true)}
                  />

                  {/* Payment */}
                  {isAdmin && (
                    <JobPaymentCard
                      job={selectedJob}
                      adjustmentMode={adjustmentMode}
                      setAdjustmentMode={setAdjustmentMode}
                      adjustmentAmount={adjustmentAmount}
                      setAdjustmentAmount={setAdjustmentAmount}
                      generatingPaymentLink={generatingPaymentLink}
                      copiedPaymentLink={copiedPaymentLink}
                      onOpenManualPayment={openManualPaymentDialog}
                      onGeneratePaymentLink={handleGeneratePaymentLink}
                      onCopyPaymentLink={handleCopyPaymentLink}
                    />
                  )}

                  {/* Lab Invoice — moved into JobDocumentsRow above */}

                  {/* Notifications */}
                  {isAdmin && (
                    <JobNotificationsCard
                      jobStatus={selectedJob.status}
                      loading={loadingNotifications}
                      statuses={notificationStatuses}
                      sendingSmsType={sendingSms}
                      onPreview={handlePreviewNotification}
                      onSendSms={handleSendSms}
                    />
                  )}
                </div>
              </div>
            </div>
            </div>
          )}
          </div>

          <DialogFooter className="bg-white border-t px-6 py-3 shrink-0 gap-2">
            {editMode && (
              <Button
                onClick={handleUpdateJob}
                className="bg-navy-900 hover:bg-navy-800"
                data-testid="save-job-button"
              >
                Save Changes
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Stones for Certificate Dialog */}
      <GroupStonesDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        selectedCount={selectedStones.length}
        saving={savingGroup}
        onConfirm={handleGroupStones}
      />

      {/* Add Stone Dialog */}
      <AddStoneDialog
        open={addStoneDialogOpen}
        onOpenChange={setAddStoneDialogOpen}
        jobNumber={selectedJob?.job_number}
        stoneTypes={stoneTypes}
        shapes={shapes}
        newStone={newStone}
        setNewStone={setNewStone}
        adding={addingStone}
        onConfirm={handleAddStoneToJob}
      />

      {/* Nested Stone Dialog - opens on top of job dialog */}
      <Dialog open={stoneDialogOpen} onOpenChange={handleStoneDialogClose}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
              <Diamond className="h-5 w-5" />
              Stone - {viewingStone?.sku}
              {isAdmin && (
                <Button
                  variant={verbalEditMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVerbalEditMode(!verbalEditMode)}
                  className={`ml-auto h-7 text-xs ${verbalEditMode ? 'bg-brand-red hover:bg-brand-red-dark' : 'border-navy-300 hover:bg-navy-100'}`}
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
            <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
              {/* Stone Info */}
              <div className="grid grid-cols-4 gap-4 p-4 bg-navy-50 rounded-lg">
                <div>
                  <Label className="text-navy-500 text-xs">Type</Label>
                  <p className="font-medium text-navy-900">{viewingStone.stone_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Weight</Label>
                  <p className="font-medium text-navy-900">{viewingStone.weight} ct</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Shape</Label>
                  <p className="font-medium text-navy-900">{viewingStone.shape}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Value</Label>
                  <p className="font-medium text-navy-900">${viewingStone.value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Fee</Label>
                  <p className="font-medium text-navy-900">
                    ${(verbalEditMode
                      ? viewingStone.fee
                        + (stoneColorStability && !viewingStone.color_stability_test ? csFeeCost : 0)
                        - (!stoneColorStability && viewingStone.color_stability_test ? csFeeCost : 0)
                        + (stoneMounted && !viewingStone.mounted ? mountedFeeCost : 0)
                        - (!stoneMounted && viewingStone.mounted ? mountedFeeCost : 0)
                      : viewingStone.fee
                    ).toLocaleString()}
                  </p>
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
                        {stoneColorStability ? `+$${csFeeCost}` : 'No'}
                      </span>
                    </div>
                  ) : (
                    <p className="font-medium text-navy-900">
                      {viewingStone.color_stability_test ? `Yes (+$${csFeeCost})` : 'No'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Mounted (Jewellery)</Label>
                  {verbalEditMode ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Switch
                        checked={stoneMounted}
                        onCheckedChange={setStoneMounted}
                        className="scale-75"
                        data-testid="stone-mounted-switch"
                      />
                      <span className="text-xs text-navy-600">
                        {stoneMounted ? `+$${mountedFeeCost}` : 'No'}
                      </span>
                    </div>
                  ) : (
                    <p className="font-medium text-navy-900">
                      {viewingStone.mounted ? `Yes (+$${mountedFeeCost})` : 'No'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Certificate Group</Label>
                  <p className="font-medium text-navy-900">
                    {viewingStone.certificate_group ? `Group ${viewingStone.certificate_group}` : '-'}
                  </p>
                </div>
              </div>

              {/* Verbal Findings Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-navy-200 pb-2">
                  <Label className="text-lg font-semibold flex items-center gap-2 text-navy-900">
                    <FileText className="h-5 w-5" />
                    Verbal Findings
                  </Label>
                  {(() => {
                    const vf = viewingStone.verbal_findings;
                    const hasFindings = vf && typeof vf === 'object' && (vf as StructuredVerbalFindings).certificate_id;
                    return hasFindings ? <Badge variant="secondary" className="bg-navy-900 text-white">Completed</Badge> : null;
                  })()}
                </div>
                
                {/* Lock indicator when not in edit mode */}
                {!verbalEditMode && isAdmin && (
                  <div className="bg-navy-50 border border-navy-200 rounded-md px-3 py-2 text-sm text-navy-600 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Click &quot;Edit&quot; to modify fees and verbal findings.
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Certificate ID */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">
                      Certificate ID
                    </Label>
                    <Input
                      placeholder="Enter certificate ID..."
                      value={structuredFindings.certificate_id || ''}
                      onChange={(e) => setStructuredFindings(prev => ({ ...prev, certificate_id: e.target.value }))}
                      className={`border-navy-200 ${!verbalEditMode ? 'bg-gray-200 text-gray-600 cursor-not-allowed opacity-70' : 'bg-white'}`}
                      disabled={!verbalEditMode}
                      data-testid="verbal-certificate-id"
                    />
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
                  <p className="text-sm text-navy-600 bg-amber-50 p-2 rounded">
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

          <DialogFooter className="flex-shrink-0 border-t pt-3 gap-2">
            {isAdmin && verbalEditMode && (
              <Button
                onClick={handleSaveStone}
                disabled={savingStoneVerbal}
                className="bg-navy-900 hover:bg-navy-800"
                data-testid="save-stone-button"
              >
                {savingStoneVerbal ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Check className="h-4 w-4 mr-2" />Save Changes</>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => handleStoneDialogClose(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <UnsavedChangesDialog
        open={unsavedConfirmOpen}
        onOpenChange={setUnsavedConfirmOpen}
        onDiscard={() => {
          setUnsavedConfirmOpen(false);
          setVerbalEditMode(false);
          setStoneDialogOpen(false);
        }}
        onSave={async () => {
          setUnsavedConfirmOpen(false);
          await handleSaveStone();
          setStoneDialogOpen(false);
        }}
      />

      {/* SMS Preview Dialog */}
      <SmsPreviewDialog
        preview={smsPreview}
        onClose={() => setSmsPreview(null)}
        onConfirm={handleConfirmSendSms}
        sending={sendingSms !== null}
      />

      {/* View Certificate Scan Dialog */}
      <DocumentViewerDialog
        open={viewCertScanOpen}
        onOpenChange={setViewCertScanOpen}
        title={`Certificate Scan - ${viewingStone?.sku || ''}`}
        url={viewingStone?.certificate_scan_url}
      />

      {/* View Memo Dialog */}
      <DocumentViewerDialog
        open={viewMemoOpen}
        onOpenChange={setViewMemoOpen}
        title={`Signed Memo - Job #${selectedJob?.job_number || ''}`}
        url={selectedJob?.signed_memo_url}
      />

      {/* View Lab Invoice Dialog */}
      <DocumentViewerDialog
        open={viewLabInvoiceOpen}
        onOpenChange={setViewLabInvoiceOpen}
        title={`Lab Invoice - Job #${selectedJob?.job_number || ''}`}
        url={selectedJob?.lab_invoice_url}
        adminOnly
      />

      {/* Bulk Status Update Dialog */}
      <BulkStatusDialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
        selectedCount={selectedJobIds.length}
        status={bulkStatus}
        setStatus={setBulkStatus}
        updating={updatingBulkStatus}
        onConfirm={handleBulkStatusUpdate}
      />

      {/* Email Preview Modal */}
      <EmailPreviewDialog
        open={previewModalOpen}
        onOpenChange={(open) => {
          setPreviewModalOpen(open);
          if (!open) setNotificationPreview(null);
        }}
        loading={loadingPreview}
        preview={notificationPreview}
        sending={sendingEmail}
        onSend={handleSendNotification}
      />

      {/* View Client Invoice Dialog */}
      <ClientInvoiceDialog
        open={viewInvoiceOpen}
        onOpenChange={setViewInvoiceOpen}
        jobNumber={selectedJob?.job_number}
        invoiceUrl={selectedJob?.invoice_url}
      />

      {/* Manual Payment Dialog */}
      <ManualPaymentDialog
        open={manualPaymentOpen}
        onOpenChange={(open) => {
          setManualPaymentOpen(open);
          if (!open) setLastPaymentResult(null);
        }}
        jobNumber={selectedJob?.job_number}
        paymentDestinations={paymentDestinations}
        amount={manualPaymentAmount}
        setAmount={setManualPaymentAmount}
        destination={manualPaymentDestination}
        setDestination={setManualPaymentDestination}
        note={manualPaymentNote}
        setNote={setManualPaymentNote}
        notifyEmail={manualPaymentNotifyEmail}
        setNotifyEmail={setManualPaymentNotifyEmail}
        notifySms={manualPaymentNotifySms}
        setNotifySms={setManualPaymentNotifySms}
        recording={recordingPayment}
        lastResult={lastPaymentResult}
        onSubmit={handleRecordManualPayment}
      />
    </div>
  );
}
