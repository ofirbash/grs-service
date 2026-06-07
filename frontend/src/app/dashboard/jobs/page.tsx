"use client";

import React, { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { jobsApi, clientsApi, branchesApi, stonesApi, settingsApi, cloudinaryApi, notificationsApi, manualPaymentsApi } from '@/lib/api';
import { openPrintWindow } from '@/lib/sanitize';
import { buildJobMemoHtml } from './_lib/buildJobMemoHtml';
import { useAuthStore, useBranchFilterStore } from '@/lib/store';
import { filterOptionsForStone } from '@/lib/stoneDropdownFilter';
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

import { StoneVerbalSection, seedStructuredFindings } from '@/components/StoneVerbalSection';
import { StoneEditDialog } from '@/components/dialogs/StoneEditDialog';

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
  // Wrap the actual page in <Suspense> so `useSearchParams()` is allowed during
  // static export. This is required by Next.js 14 when `output: 'export'` is set.
  return (
    <Suspense fallback={<div className="p-8 text-center text-navy-500">Loading...</div>}>
      <JobsPageContent />
    </Suspense>
  );
}

function JobsPageContent() {
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
  // Configurable list of recheck reasons surfaced when the user picks
  // service_type === "Recheck" in the Create Job dialog. Populated from
  // pricing_config.recheck_reasons; admins edit it via Settings.
  const [recheckReasonOptions, setRecheckReasonOptions] = useState<string[]>([
    'Origin', 'Color', 'Identification', 'Comment',
  ]);
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
  const [formData, setFormData] = useState<{
    client_id: string;
    branch_id: string;
    service_type: string;
    notes: string;
    recheck_reasons: string[];
  }>({
    client_id: '',
    branch_id: '',
    service_type: '',
    notes: '',
    recheck_reasons: [],
  });
  const [stones, setStones] = useState<Array<{
    _uid: string;
    stone_type: string;
    weight: string;
    shape: string;
    value: string;
    color_stability_test: boolean;
    is_parcel?: boolean;
    stone_count?: string;
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
    // Recheck jobs additionally require at least one reason selected.
    const recheckOk = formData.service_type !== 'Recheck' || (formData.recheck_reasons && formData.recheck_reasons.length > 0);
    return hasRequiredFields && hasValidStone && Boolean(recheckOk);
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
      setFormData({ client_id: '', branch_id: '', service_type: '', notes: '', recheck_reasons: [] });
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
      // Use allSettled so a single flaky endpoint (e.g. transient 502) does
      // not blank out the entire dashboard. Failed slices are logged and
      // skipped; the rest still render. Session-expired (401/403) is handled
      // by the global axios interceptor in lib/api.ts → redirect to /login.
      const results = await Promise.allSettled([
        jobsApi.getAll(branchParam),
        clientsApi.getAll(selectedBranchId || undefined),
        branchesApi.getAll(),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
        settingsApi.getPricing().catch(() => ({ service_types: ['Express', 'Normal', 'Recheck'] })),
      ]);
      const [jobsR, clientsR, branchesR, dropdownR, pricingR] = results;
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const labels = ['jobs', 'clients', 'branches', 'dropdowns', 'pricing'];
          console.error(`fetchData: failed to load ${labels[i]}`, r.reason);
        }
      });
      if (jobsR.status === 'fulfilled') setJobs(jobsR.value);
      if (clientsR.status === 'fulfilled') setClients(clientsR.value);
      if (branchesR.status === 'fulfilled') setBranches(branchesR.value);
      if (dropdownR.status === 'fulfilled') setDropdownSettings(dropdownR.value);
      if (pricingR.status === 'fulfilled') {
        const pricingData = pricingR.value;
        if (pricingData.service_types?.length) {
          setServiceTypes(pricingData.service_types);
        }
        if (pricingData.color_stability_fee != null) setCsFeeCost(pricingData.color_stability_fee);
        if (pricingData.mounted_jewellery_fee != null) setMountedFeeCost(pricingData.mounted_jewellery_fee);
        if (pricingData.stone_types?.length) setStoneTypes(pricingData.stone_types);
        if (pricingData.shapes?.length) setShapes(pricingData.shapes);
        if (pricingData.payment_destinations?.length) setPaymentDestinations(pricingData.payment_destinations);
        if (pricingData.recheck_reasons?.length) setRecheckReasonOptions(pricingData.recheck_reasons);
      }

      // Initialize dropdowns if empty
      if (dropdownR.status === 'fulfilled' && !dropdownR.value.identification?.length) {
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
    // When a row flips OFF parcel, clear the count so it doesn't ride along
    // as a stale string.
    if (field === 'is_parcel' && value === false) {
      newStones[index].stone_count = '';
    }
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

    // Initialize structured findings — shared logic handles both single
    // stones and parcels (parcels get N empty per_stone entries).
    setStructuredFindings(seedStructuredFindings(stone));

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
    const vf = viewingStone.verbal_findings;
    const existingFindings = (vf && typeof vf === 'object') ? vf as StructuredVerbalFindings : null;

    // Cert ID is shared for both singles and parcels.
    const certChanged = (structuredFindings.certificate_id || '') !== (existingFindings?.certificate_id || '');

    if (viewingStone.kind === 'parcel') {
      // Compare the per-stone arrays field-by-field. A row counts as changed
      // if any of {weight, identification, color, origin, comment} differs
      // from the saved value (treat missing as "").
      const existing = existingFindings?.per_stone || [];
      const current = structuredFindings.per_stone || [];
      const len = Math.max(existing.length, current.length);
      const norm = (v: unknown) => (v == null ? '' : String(v));
      const numNorm = (v: unknown) => (v == null || v === '' ? '' : String(v));
      let perStoneChanged = false;
      for (let i = 0; i < len; i++) {
        const a = existing[i] || {};
        const b = current[i] || {};
        if (
          numNorm(a.weight) !== numNorm(b.weight) ||
          norm(a.identification) !== norm(b.identification) ||
          norm(a.color) !== norm(b.color) ||
          norm(a.origin) !== norm(b.origin) ||
          norm(a.comment) !== norm(b.comment)
        ) {
          perStoneChanged = true;
          break;
        }
      }
      return hasColorStabilityChange || hasMountedChange || certChanged || perStoneChanged;
    }

    // Single-stone: compare top-level fields. Any field that differs from
    // the persisted value counts — including clearing a previously-set
    // value (existing -> empty).
    const hasVerbalChange = (
      certChanged ||
      (structuredFindings.identification || '') !== (existingFindings?.identification || '') ||
      (structuredFindings.color || '') !== (existingFindings?.color || '') ||
      (structuredFindings.origin || '') !== (existingFindings?.origin || '') ||
      (structuredFindings.comment || '') !== (existingFindings?.comment || '')
    );
    return hasColorStabilityChange || hasMountedChange || hasVerbalChange;
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
      // Always persist verbal findings while in edit mode, even when every
      // field has been cleared — otherwise wiping multiple fields and saving
      // silently does nothing, leaving stale values in the DB.
      await stonesApi.updateStructuredVerbal(viewingStone.id, structuredFindings);
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
      }      fetchData();
      setVerbalEditMode(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes');
    } finally {
      setSavingStoneVerbal(false);
    }
  };

  /** Cert-scan upload handler for the canonical StoneEditDialog. Lifted
   *  unchanged from the previously-inline file-input onChange so the
   *  component can receive it as a prop. Handles both per-stone and
   *  certificate-group routing. */
  const handleStoneCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewingStone || !selectedJob) return;
    setUploadingCertScan(true);
    try {
      const folder = `certificates/${selectedJob.id}`;
      const { url } = await cloudinaryApi.uploadFile(file, folder);
      if (viewingStone.certificate_group) {
        await stonesApi.uploadGroupCertificateScan(
          selectedJob.id,
          viewingStone.certificate_group,
          file.name,
          url,
        );
        const updatedStones = selectedJob.stones?.map((s) =>
          s.certificate_group === viewingStone.certificate_group
            ? { ...s, certificate_scan_url: url }
            : s,
        );
        setSelectedJob({ ...selectedJob, stones: updatedStones });
      } else {
        await stonesApi.uploadCertificateScan(viewingStone.id, file.name, url);
        const updatedStones = selectedJob.stones?.map((s) =>
          s.id === viewingStone.id ? { ...s, certificate_scan_url: url } : s,
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
    // Recheck-only: must have at least one reason. Match backend rule.
    if (formData.service_type === 'Recheck' && (!formData.recheck_reasons || formData.recheck_reasons.length === 0)) {
      errors.push('Recheck jobs require at least one reason');
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
        // Parcel-specific: stone_count >= 2 is required.
        if (stone.is_parcel) {
          const n = parseInt(stone.stone_count || '0', 10);
          if (!stone.stone_count) {
            errors.push(`Stone ${index + 1}: Parcel requires a stone count`);
          } else if (Number.isNaN(n) || n < 2) {
            errors.push(`Stone ${index + 1}: Parcel must have at least 2 stones`);
          }
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
        client_id: formData.client_id,
        branch_id: formData.branch_id,
        service_type: formData.service_type,
        notes: formData.notes,
        // Only send recheck_reasons for Recheck jobs; backend silently drops
        // it for other service types anyway, but cleaner to not send it.
        ...(formData.service_type === 'Recheck' && formData.recheck_reasons.length > 0
          ? { recheck_reasons: formData.recheck_reasons }
          : {}),
        certificate_units: [{
          stones: validStones.map(s => ({
            stone_type: s.stone_type,
            weight: parseFloat(s.weight),
            shape: s.shape || 'Other', // Default to 'Other' if not specified
            value: parseFloat(s.value),
            color_stability_test: s.color_stability_test,
            ...(s.is_parcel
              ? { is_parcel: true, stone_count: parseInt(s.stone_count || '0', 10) }
              : {}),
          })),
        }],
      });
      // Close dialog and reset form (handleCreateDialogClose handles cleanup)
      setCreateDialogOpen(false);
      setFormData({ client_id: '', branch_id: '', service_type: '', notes: '', recheck_reasons: [] });
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
  //
  // Cancelled stones are hidden from the active job view (they stay on the
  // backend for audit and can be inspected via the Stones page "Show
  // cancelled" toggle). Everything user-facing below operates on
  // `selectedJobActiveStones`, never `selectedJob.stones` directly.
  const selectedJobActiveStones = useMemo(
    () => (selectedJob ? selectedJob.stones.filter((s) => !s.cancelled) : []),
    [selectedJob],
  );
  const selectedJobCancelledCount = useMemo(
    () => (selectedJob ? selectedJob.stones.filter((s) => s.cancelled).length : 0),
    [selectedJob],
  );
  const selectedJobStoneGroups = useMemo(
    () => (selectedJob ? organizeStonesIntoGroups(selectedJobActiveStones) : []),
    [selectedJob, selectedJobActiveStones],
  );
  const selectedJobUngroupedStones = useMemo(
    () => selectedJobActiveStones.filter((s) => !s.certificate_group),
    [selectedJobActiveStones],
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
    const clientFull = clients.find((c) => c.id === job.client_id);
    const branchFull = branches.find((b) => b.id === job.branch_id);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const html = buildJobMemoHtml({ job, client: clientFull, branch: branchFull, origin });
    const printWindow = openPrintWindow(html);
    if (!printWindow) {
      alert("Please allow popups to print");
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

  // Parcels cannot be combined into a certificate group (a parcel already IS
  // its own certificate). Hide the "Group" affordance whenever any parcel is
  // selected so the user can't even try.
  const anySelectedStoneIsParcel = () => {
    if (!selectedJob || selectedStones.length === 0) return false;
    const selectedStoneObjects = selectedJob.stones.filter(s => selectedStones.includes(s.id));
    return selectedStoneObjects.some(s => s.kind === 'parcel');
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
                    <span>
                      {job.total_stones} {job.total_stones === 1 ? 'stone' : 'stones'}
                      {job.total_certificates != null && job.total_certificates !== job.total_stones && (
                        <span className="text-navy-400"> &middot; {job.total_certificates} cert{job.total_certificates === 1 ? '' : 's'}</span>
                      )}
                      &nbsp;&middot; {job.service_type}
                      {job.service_type === 'Recheck' && job.recheck_reasons && job.recheck_reasons.length > 0 && (
                        <span className="text-amber-700 font-medium"> ({job.recheck_reasons.join(', ')})</span>
                      )}
                    </span>
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
                        <div className="leading-tight">
                          <div>{job.service_type}</div>
                          {job.service_type === 'Recheck' && job.recheck_reasons && job.recheck_reasons.length > 0 && (
                            <div
                              className="text-[10px] text-amber-700 font-medium truncate"
                              title={`Recheck reasons: ${job.recheck_reasons.join(', ')}`}
                              data-testid={`recheck-reasons-cell-${job.job_number}`}
                            >
                              {job.recheck_reasons.join(', ')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-navy-600 text-center" onClick={() => openJobDetails(job)}>
                        <div className="leading-tight">
                          <div className="font-medium text-navy-900">{job.total_stones}</div>
                          {job.total_certificates != null && job.total_certificates !== job.total_stones && (
                            <div className="text-[10px] text-navy-500">{job.total_certificates} cert{job.total_certificates === 1 ? '' : 's'}</div>
                          )}
                        </div>
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
        recheckReasonOptions={recheckReasonOptions}
        stoneTypes={stoneTypes}
        shapes={shapes}
        stones={stones}
        onStoneChange={(index, field, value) => handleStoneChange(index, field, value)}
        onAddStone={handleAddStone}
        onRemoveStone={handleRemoveStone}
        creating={creating}
        isFormValid={isFormValid}
        onSubmit={handleCreateJob}
        onClientCreated={async () => {
          // The job dialog already auto-selected the new client into
          // formData.client_id; we just need to refresh the `clients`
          // list so the SearchableSelect can render the new label.
          await fetchData();
        }}
        defaultBranchId={user?.branch_id || selectedBranchId || ''}
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
          {/* Sticky header — title + status badge inline.
              Actions (Print / Edit) move to the right of the title; Save +
              Close + per-document buttons live in the sticky footer below. */}
          <DialogHeader className="bg-white border-b px-6 py-3 shrink-0">
            <DialogTitle className="text-xl text-navy-800 flex items-center justify-between gap-4">
              <span className="flex items-center gap-3 min-w-0">
                <span className="truncate">Job #{selectedJob?.job_number}</span>
                {selectedJob && <span className="flex-shrink-0">{getStatusBadge(selectedJob.status)}</span>}
                {selectedJob && editMode && (
                  <Select
                    value={editFormData.status}
                    onValueChange={(value) => setEditFormData({ ...editFormData, status: value })}
                  >
                    <SelectTrigger className="h-7 w-44 ml-2" data-testid="edit-status-select">
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
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </span>
              {selectedJob && (
                <span className="flex gap-2 flex-shrink-0">
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
                </span>
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
              />

              {/* Two-column layout: Stones (left) + Actions sidebar (right) */}
              <div className="space-y-4 border-t pt-4">
                {/* Stones Table */}
                <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Gem className="h-4 w-4" />
                      Stones ({selectedJobActiveStones.length} total)
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
                    {isAdmin && selectedStones.length >= 2 && !anySelectedStoneGrouped() && !anySelectedStoneIsParcel() && (
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
                    {isAdmin && selectedStones.length >= 2 && anySelectedStoneIsParcel() && (
                      <p className="text-xs text-amber-700 italic" data-testid="parcel-group-hint">
                        Parcels can&apos;t be combined into a certificate group.
                      </p>
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
                  {selectedJobActiveStones.map((stone) => (
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
                        const groupedStones = selectedJobActiveStones.filter(s => s.certificate_group);
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

                {/* Payment + Notifications — stays in the scroll body */}
                {isAdmin && selectedJob && (
                  <div className="border-t border-navy-200 pt-4 mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    <JobNotificationsCard
                      jobStatus={selectedJob.status}
                      loading={loadingNotifications}
                      statuses={notificationStatuses}
                      sendingSmsType={sendingSms}
                      onPreview={handlePreviewNotification}
                      onSendSms={handleSendSms}
                    />
                  </div>
                )}
            </div>
            </div>
          )}
          </div>

          {/* Sticky compact actions strip — sits just above the dialog footer.
              Document upload/view buttons (Memo, Client Invoice, Lab Invoice)
              live here so the user can act on the job without scrolling. */}
          {selectedJob && (
            <div className="bg-white border-t px-4 py-2.5 shrink-0 flex items-center gap-4">
              <div className="flex-1 min-w-0">
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
              </div>
              {/* Close button shares the row with the documents to keep the
                  footer compact. Save button only appears in edit mode. */}
              {isAdmin && editMode && (
                <Button
                  onClick={handleUpdateJob}
                  className="h-9 px-4 bg-navy-900 hover:bg-navy-800"
                  size="sm"
                  data-testid="save-job-button"
                >
                  Save Changes
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewDialogOpen(false)}
                className="h-9 px-4"
                data-testid="close-job-dialog"
              >
                Close
              </Button>
            </div>
          )}
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
      <StoneEditDialog
        open={stoneDialogOpen}
        onOpenChange={handleStoneDialogClose}
        stone={viewingStone}
        job={selectedJob}
        isAdmin={isAdmin}
        findings={structuredFindings}
        setFindings={setStructuredFindings}
        dropdownSettings={dropdownSettings}
        editMode={verbalEditMode}
        setEditMode={setVerbalEditMode}
        colorStability={stoneColorStability}
        setColorStability={setStoneColorStability}
        mounted={stoneMounted}
        setMounted={setStoneMounted}
        csFeeCost={csFeeCost}
        mountedFeeCost={mountedFeeCost}
        saving={savingStoneVerbal}
        onSave={handleSaveStone}
        certInputRef={certScanInputRef}
        uploadingCert={uploadingCertScan}
        onCertChange={handleStoneCertUpload}
        onViewCert={() => setViewCertScanOpen(true)}
      />


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
