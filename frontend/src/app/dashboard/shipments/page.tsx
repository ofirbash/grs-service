"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { shipmentsApi, jobsApi, stonesApi, settingsApi, cloudinaryApi, branchesApi, addressesApi } from '@/lib/api';
import { useBranchFilterStore, useAuthStore } from '@/lib/store';
import { openPrintWindow } from '@/lib/sanitize';
import { buildShipmentJobMemoHtml } from './_lib/buildShipmentJobMemoHtml';
import { FileViewerDialog } from './_components/FileViewerDialog';
import { BulkStatusDialog } from './_components/BulkStatusDialog';
import { AddJobsToShipmentDialog } from './_components/AddJobsToShipmentDialog';
import { CreateShipmentDialog } from './_components/CreateShipmentDialog';
import { ShipmentDetailDialog } from './_components/ShipmentDetailDialog';
import { JobDetailDialog } from './_components/JobDetailDialog';
import { StoneEditDialog } from '@/components/dialogs/StoneEditDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  Plus,
  Search,
  Truck,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  FileCheck2,
  Send,
  Gem,
} from 'lucide-react';

import type {
  Shipment, StructuredVerbalFindings, Stone, Job, DropdownSettings,
  ShipmentOptions,
} from './_types';
import { printShipmentMemo, memoCategoriesPresent, type MemoCategory } from './_print/shipment-memo';
import { DoubleConfirmDialog } from '@/components/DoubleConfirmDialog';

/** Job statuses eligible to JOIN a fresh shipment, keyed by shipment type.
 *  Mirrors the natural lab lifecycle — admins explicitly asked Feb 27 2026
 *  for this gate to prevent picking the wrong jobs into a shipment.
 *
 *  (c) certificates_from_lab covers BOTH `verbal_uploaded` and
 *  `cert_uploaded` because the lab sometimes returns certificates before
 *  the cert PDF has been scanned/uploaded — the physical paper leaves
 *  the lab first, the scan follows. */
const SHIPMENT_ELIGIBLE_STATUSES: Record<string, string[]> = {
  send_stones_to_lab: ['stones_accepted'],
  stones_from_lab: ['verbal_uploaded'],
  certificates_from_lab: ['verbal_uploaded', 'cert_uploaded'],
};

/** A job is "locked" while any of its shipments is still pending/in-transit.
 *  Returns the set of job_ids that cannot join a new shipment yet. */
function getActivelyShippedJobIds(shipments: Shipment[]): Set<string> {
  const locked = new Set<string>();
  for (const s of shipments) {
    if (s.status === 'pending' || s.status === 'in_transit') {
      for (const jid of s.job_ids || []) locked.add(jid);
    }
  }
  return locked;
}

/** Filter the master available-jobs list to only those eligible for the
 *  given shipment_type. Used by both the Create dialog and the
 *  Add-Jobs-to-existing-shipment dialog. If shipment_type is falsy
 *  (admin hasn't picked one yet), return [] so the picker stays empty
 *  until the type is chosen — admins were confused selecting jobs first
 *  then finding out half of them got rejected. */
function eligibleJobsForShipmentType(
  jobs: Job[],
  shipmentType: string | undefined,
  shipments: Shipment[],
  excludeJobIds?: Set<string>,
): Job[] {
  if (!shipmentType) return [];
  const allowed = SHIPMENT_ELIGIBLE_STATUSES[shipmentType];
  if (!allowed) return jobs; // unknown type — fall back to old behaviour
  const locked = getActivelyShippedJobIds(shipments);
  return jobs.filter((j) =>
    allowed.includes(j.status) &&
    !locked.has(j.id) &&
    !(excludeJobIds && excludeJobIds.has(j.id)),
  );
}

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [preciousTypes, setPreciousTypes] = useState<string[]>(['Ruby', 'Sapphire', 'Emerald']);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [filteredAvailableJobs, setFilteredAvailableJobs] = useState<Job[]>([]);
  const [options, setOptions] = useState<ShipmentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [typeFilter, setTypeFilter] = useState<'all' | 'send_stones_to_lab' | 'stones_from_lab' | 'certificates_from_lab'>('all');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';
  const [userBranchName, setUserBranchName] = useState('');
  
  // Create shipment dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  // For partial-return shipments: specific stones within the selected jobs.
  // Empty => all stones of those jobs (legacy/full flow).
  const [selectedStoneIds, setSelectedStoneIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    shipment_type: '',
    courier: '',
    source_address: '',
    destination_address: '',
    tracking_number: '',
    date_sent: '',
    notes: '',
  });

  // Edit shipment
  const [editingShipment, setEditingShipment] = useState(false);
  const [editFormData, setEditFormData] = useState({
    shipment_type: '',
    courier: '',
    source_address: '',
    destination_address: '',
    tracking_number: '',
    date_sent: '',
    notes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // View shipment dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [shipmentJobs, setShipmentJobs] = useState<Job[]>([]);

  // Cancel-shipment double-confirm
  const [cancelShipmentTarget, setCancelShipmentTarget] = useState<Shipment | null>(null);

  // Nested Job dialog (opens on top of shipment dialog)
  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [editJobMode, setEditJobMode] = useState(false);
  const [editJobFormData, setEditJobFormData] = useState({
    notes: '',
    status: '',
  });

  // Nested Stone dialog (opens on top of job dialog)
  const [stoneDialogOpen, setStoneDialogOpen] = useState(false);
  const [selectedStone, setSelectedStone] = useState<Stone | null>(null);
  const [savingVerbal, setSavingVerbal] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [viewCertOpen, setViewCertOpen] = useState(false);
  // Admin fee toggles + edit mode — added Feb 25 2026 when the shipments
  // stone-detail modal was unified with the canonical StoneEditDialog so
  // admins viewing a stone from inside a shipment have the same edit
  // capabilities as on the Jobs / Stones pages (no more drift across copies).
  const [verbalEditMode, setVerbalEditMode] = useState(false);
  const [stoneColorStability, setStoneColorStability] = useState(false);
  const [stoneMounted, setStoneMounted] = useState(false);
  const [csFeeCost, setCsFeeCost] = useState(50);
  const [mountedFeeCost, setMountedFeeCost] = useState(50);
  const certInputRef = useRef<HTMLInputElement>(null);
  
  // Memo upload for nested job dialog
  const memoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMemo, setUploadingMemo] = useState(false);
  const [viewMemoOpen, setViewMemoOpen] = useState(false);
  
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

  // Add jobs to shipment dialog
  const [addJobsDialogOpen, setAddJobsDialogOpen] = useState(false);
  const [jobsToAdd, setJobsToAdd] = useState<string[]>([]);
  const [addingJobs, setAddingJobs] = useState(false);

  // Bulk status update for jobs in shipment
  const [selectedShipmentJobs, setSelectedShipmentJobs] = useState<string[]>([]);
  const [bulkStatusDialogOpen, setBulkStatusDialogOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [updatingBulkStatus, setUpdatingBulkStatus] = useState(false);

  // PDF generation
  const [generatingPdf, setGeneratingPdf] = useState(false);
  // Lookup table: short address label (e.g. "Israel Office") -> full readable address.
  // Built from the branches + standalone addresses tables; passed to the print
  // function so the shipment memo shows complete street/city info.
  const [addressBook, setAddressBook] = useState<Record<string, string>>({});
  const { selectedBranchId } = useBranchFilterStore();
  // When true, the GET /shipments call sends include_archived=true so
  // completed + cancelled shipments are returned. False by default → the
  // operator sees only the active queue. We still fetch a count of completed
  // shipments separately so the stats card always shows it.
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, showCompleted, statusFilter]);

  const fetchData = async () => {
    try {
      const branchParam: { branch_id?: string; include_archived?: boolean } = selectedBranchId ? { branch_id: selectedBranchId } : {};
      // include_archived expands the API response to also return
      // `completed` + `cancelled` shipments. We send it when:
      //  - the operator explicitly toggled "Show completed", OR
      //  - they picked a status filter that *only* makes sense with
      //    archived rows (`completed`, `cancelled`, or `all`).
      const needsArchived =
        showCompleted ||
        statusFilter === 'completed' ||
        statusFilter === 'cancelled' ||
        statusFilter === 'all';
      if (needsArchived) branchParam.include_archived = true;
      // Always fetch the completed/cancelled count separately so the stats
      // card has a number to display even when the main list filters them
      // out. Cheap: same endpoint, status filter, count locally.
      const archivedParam: { branch_id?: string; include_archived: boolean } = { include_archived: true };
      if (selectedBranchId) archivedParam.branch_id = selectedBranchId;
      // allSettled so one flaky endpoint doesn't blank the whole shipments
      // page; session-expired (401/403) is handled by the global interceptor.
      const results = await Promise.allSettled([
        shipmentsApi.getAll(branchParam),
        jobsApi.getAll(selectedBranchId ? { branch_id: selectedBranchId } : {}),
        shipmentsApi.getOptions(),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
        branchesApi.getAll(),
        addressesApi.getAll().catch(() => [] as Array<{ name: string; address?: string }>),
        shipmentsApi.getAll(archivedParam).catch(() => []),
        settingsApi.getPricing().catch(() => ({} as Record<string, unknown>)),
      ]);
      const [shipmentsR, jobsR, optionsR, dropdownR, branchesR, addressesR, archivedR, pricingR] = results;
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const labels = ['shipments', 'jobs', 'options', 'dropdowns', 'branches', 'addresses', 'archived', 'pricing'];
          console.error(`fetchData: failed to load ${labels[i]}`, r.reason);
        }
      });
      // Pricing — only the two fee constants the canonical StoneEditDialog
      // needs. Falls back to the existing defaults if pricing API fails.
      if (pricingR.status === 'fulfilled') {
        const p = pricingR.value as Record<string, unknown>;
        if (typeof p.color_stability_fee === 'number') setCsFeeCost(p.color_stability_fee);
        if (typeof p.mounted_jewellery_fee === 'number') setMountedFeeCost(p.mounted_jewellery_fee);
        if (Array.isArray(p.precious_stone_types)) setPreciousTypes(p.precious_stone_types as string[]);
      }
      if (archivedR.status === 'fulfilled') {
        const archived = archivedR.value as Array<{ status?: string }>;
        setCompletedCount(archived.filter((s) => s.status === 'completed').length);
      }
      if (shipmentsR.status === 'fulfilled') setShipments(shipmentsR.value);
      if (jobsR.status === 'fulfilled') {
        // Hide finished + cancelled jobs from the "Add jobs to shipment"
        // picker — only live jobs are eligible for new shipments.
        setAvailableJobs(jobsR.value.filter((j: Job) => j.status !== 'done' && j.status !== 'cancelled'));
      }
      if (optionsR.status === 'fulfilled') setOptions(optionsR.value);
      if (dropdownR.status === 'fulfilled') setDropdownSettings(dropdownR.value);
      const branchesData = branchesR.status === 'fulfilled' ? branchesR.value : [];
      const addressesData = addressesR.status === 'fulfilled' ? addressesR.value : [];

      // Build the short-label → "Address line, Phone" lookup for shipment
      // memos. The memo intentionally omits the branch/address *name* and
      // keeps only the postal line plus phone number. Falls back gracefully
      // if phone or address is missing.
      const joinAddressPhone = (addr?: string, phone?: string): string => {
        const parts = [addr, phone].map((s) => (s || '').trim()).filter(Boolean);
        return parts.join(', ');
      };
      const book: Record<string, string> = {};
      for (const b of branchesData as Array<{ name: string; address?: string; phone?: string }>) {
        if (b?.name) book[b.name] = joinAddressPhone(b.address, b.phone) || b.name;
      }
      for (const a of addressesData as Array<{ name: string; address?: string; phone?: string }>) {
        if (a?.name) book[a.name] = joinAddressPhone(a.address, a.phone) || a.name;
      }
      setAddressBook(book);

      // Set user's branch name for default source address
      if (user?.branch_id && branchesData.length) {
        const branch = branchesData.find((b: { id: string; name: string }) => b.id === user.branch_id);
        if (branch) setUserBranchName(branch.name);
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

  // Helper to open nested stone dialog
  const openNestedStoneDialog = (stone: Stone) => {
    setSelectedStone(stone);
    // Seed fee toggles + start in locked (read-only) mode. Admins click
    // "Edit" in the dialog header to switch to edit mode — keeps the
    // common case (reviewing without mutating) safe by default.
    setStoneColorStability(stone.color_stability_test || false);
    setStoneMounted(stone.mounted || false);
    setVerbalEditMode(false);

    // Initialize structured findings from stone data
    const findings = typeof stone.verbal_findings === 'object' ? stone.verbal_findings : {};
    setStructuredFindings({
      certificate_id: findings?.certificate_id || '',
      weight: findings?.weight || stone.weight,
      identification: findings?.identification || '',
      color: findings?.color || '',
      origin: findings?.origin || '',
      comment: findings?.comment || ''
    });
    
    setStoneDialogOpen(true);
  };

  /** Save verbal findings + fee toggles for the currently-open stone.
   *  Unified Feb 25 2026 with the Jobs/Stones pages so admins viewing
   *  a stone from inside a shipment can also edit Color Stability /
   *  Mounted (was missing from the shipments-local copy). */
  const handleSaveStoneVerbal = async () => {
    if (!selectedStone) return;
    setSavingVerbal(true);
    try {
      await stonesApi.updateStructuredVerbal(selectedStone.id, structuredFindings);
      const hasColorStabilityChange = stoneColorStability !== selectedStone.color_stability_test;
      const hasMountedChange = stoneMounted !== (selectedStone.mounted || false);
      if (hasColorStabilityChange || hasMountedChange) {
        const feeUpdateData: { color_stability_test?: boolean; mounted?: boolean } = {};
        if (hasColorStabilityChange) feeUpdateData.color_stability_test = stoneColorStability;
        if (hasMountedChange) feeUpdateData.mounted = stoneMounted;
        await stonesApi.updateFees(selectedStone.id, feeUpdateData);
      }
      setSelectedStone({
        ...selectedStone,
        verbal_findings: structuredFindings,
        color_stability_test: stoneColorStability,
        mounted: stoneMounted,
      });
      if (selectedJob) {
        const updatedStones = selectedJob.stones?.map((s) =>
          s.id === selectedStone.id
            ? { ...s, verbal_findings: structuredFindings, color_stability_test: stoneColorStability, mounted: stoneMounted }
            : s,
        );
        setSelectedJob({ ...selectedJob, stones: updatedStones });
      }
      setVerbalEditMode(false);
      fetchData();
    } catch (error) {
      console.error('Failed to save verbal findings:', error);
      alert('Failed to save verbal findings');
    } finally {
      setSavingVerbal(false);
    }
  };

  /** Upload a certificate scan for the open stone (or the whole certificate
   *  group, if grouped). Mirrors the inline closure that used to live on the
   *  cert <input>'s onChange. */
  const handleStoneCertChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStone || !selectedJob) return;

    setUploadingCert(true);
    try {
      const folder = `certificates/${selectedJob.id}`;
      const { url } = await cloudinaryApi.uploadFile(file, folder);

      if (selectedStone.certificate_group) {
        await stonesApi.uploadGroupCertificateScan(
          selectedJob.id,
          selectedStone.certificate_group,
          file.name,
          url,
        );
        const updatedStones = selectedJob.stones?.map((s) =>
          s.certificate_group === selectedStone.certificate_group
            ? { ...s, certificate_scan_url: url }
            : s,
        );
        setSelectedJob({ ...selectedJob, stones: updatedStones });
      } else {
        await stonesApi.uploadCertificateScan(selectedStone.id, file.name, url);
        const updatedStones = selectedJob.stones?.map((s) =>
          s.id === selectedStone.id ? { ...s, certificate_scan_url: url } : s,
        );
        setSelectedJob({ ...selectedJob, stones: updatedStones });
      }

      setSelectedStone({ ...selectedStone, certificate_scan_url: url });
    } catch (error) {
      console.error('Failed to upload certificate scan:', error);
      alert('Failed to upload certificate scan');
    } finally {
      setUploadingCert(false);
    }

    if (certInputRef.current) {
      certInputRef.current.value = '';
    }
  };

  // Handle memo upload for job in shipment context
  const handleMemoUploadInShipment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJob) return;

    setUploadingMemo(true);
    try {
      // Upload to Cloudinary
      const folder = `memos/${selectedJob.id}`;
      const { url } = await cloudinaryApi.uploadFile(file, folder);
      
      // Save URL to backend
      await jobsApi.uploadMemo(selectedJob.id, file.name, url);
      
      // Refresh shipment jobs to get the updated memo URL
      if (selectedShipment) {
        const allJobs = await jobsApi.getAll();
        const jobs = allJobs.filter((j: Job) => selectedShipment.job_ids.includes(j.id));
        setShipmentJobs(jobs);
        // Update the selected job with the new memo URL
        const updatedJob = jobs.find((j: Job) => j.id === selectedJob.id);
        if (updatedJob) setSelectedJob(updatedJob);
      }
    } catch (error) {
      console.error('Failed to upload memo:', error);
      alert('Failed to upload memo. Please try again.');
    } finally {
      setUploadingMemo(false);
      // Reset file input so the same file can be selected again
      if (memoInputRef.current) {
        memoInputRef.current.value = '';
      }
    }
  };

  const handleCreateShipment = async () => {
    if (!formData.shipment_type || !formData.courier || !formData.source_address || !formData.destination_address) {
      return;
    }

    setCreating(true);
    try {
      await shipmentsApi.create({
        ...formData,
        // Empty string => let backend default to "now"; otherwise convert YYYY-MM-DD to ISO
        date_sent: formData.date_sent ? new Date(formData.date_sent).toISOString() : undefined,
        job_ids: selectedJobs,
        stone_ids: selectedStoneIds,
      });
      setCreateDialogOpen(false);
      setFormData({
        shipment_type: '',
        courier: '',
        source_address: '',
        destination_address: '',
        tracking_number: '',
        date_sent: '',
        notes: '',
      });
      setSelectedJobs([]);
      setSelectedStoneIds([]);
      fetchData();
    } catch (error) {
      console.error('Failed to create shipment:', error);
    } finally {
      setCreating(false);
    }
  };

  // Edit shipment handler
  const handleStartEditShipment = () => {
    if (!selectedShipment) return;
    setEditFormData({
      shipment_type: selectedShipment.shipment_type,
      courier: selectedShipment.courier,
      source_address: selectedShipment.source_address,
      destination_address: selectedShipment.destination_address,
      tracking_number: selectedShipment.tracking_number || '',
      // ISO date -> YYYY-MM-DD for the <input type="date">
      date_sent: selectedShipment.date_sent ? String(selectedShipment.date_sent).slice(0, 10) : '',
      notes: selectedShipment.notes || '',
    });
    setEditingShipment(true);
  };

  const handleSaveEditShipment = async () => {
    if (!selectedShipment) return;
    setSavingEdit(true);
    try {
      await shipmentsApi.update(selectedShipment.id, {
        ...editFormData,
        date_sent: editFormData.date_sent ? new Date(editFormData.date_sent).toISOString() : undefined,
      });
      setEditingShipment(false);
      fetchData();
      // Refresh selected shipment — include archived because if the user
      // just marked a cert-from-lab shipment as delivered, it auto-flipped
      // to "completed" and would otherwise be hidden from the default fetch.
      const updatedShipments = await shipmentsApi.getAll({
        ...(selectedBranchId ? { branch_id: selectedBranchId } : {}),
        include_archived: true,
      });
      const updated = updatedShipments.find((s: Shipment) => s.id === selectedShipment.id);
      if (updated) setSelectedShipment(updated);
    } catch (error) {
      console.error('Failed to update shipment:', error);
    } finally {
      setSavingEdit(false);
    }
  };

  // Update job from nested dialog
  const handleUpdateJobInShipment = async () => {
    if (!selectedJob) return;
    
    try {
      await jobsApi.update(selectedJob.id, {
        notes: editJobFormData.notes,
        status: editJobFormData.status,
      });
      // Refresh shipment jobs
      if (selectedShipment) {
        const allJobs = await jobsApi.getAll();
        const jobs = allJobs.filter((j: Job) => selectedShipment.job_ids.includes(j.id));
        setShipmentJobs(jobs);
        const updatedJob = jobs.find((j: Job) => j.id === selectedJob.id);
        if (updatedJob) {
          setSelectedJob(updatedJob);
          setEditJobFormData({ notes: updatedJob.notes || '', status: updatedJob.status });
        }
      }
      setEditJobMode(false);
      fetchData();
    } catch (error) {
      console.error('Failed to update job:', error);
    }
  };

  // Print job from nested dialog
  const handlePrintJobInShipment = (job: Job) => {
    const html = buildShipmentJobMemoHtml(job);
    const printWindow = openPrintWindow(html);
    if (!printWindow) {
      alert('Please allow popups to print');
    }
  };

  const handleUpdateStatus = async (shipmentId: string, newStatus: string) => {
    try {
      await shipmentsApi.updateStatus(shipmentId, newStatus, true);
      fetchData();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleAddJobsToShipment = async () => {
    if (!selectedShipment || jobsToAdd.length === 0) return;
    
    setAddingJobs(true);
    try {
      const currentJobIds = selectedShipment.job_ids || [];
      const newJobIds = [...currentJobIds, ...jobsToAdd];
      await shipmentsApi.updateJobs(selectedShipment.id, newJobIds);
      setAddJobsDialogOpen(false);
      setJobsToAdd([]);
      fetchData();
      // Refresh selected shipment
      const updatedShipment = await shipmentsApi.getById(selectedShipment.id);
      setSelectedShipment(updatedShipment);
    } catch (error) {
      console.error('Failed to add jobs to shipment:', error);
    } finally {
      setAddingJobs(false);
    }
  };

  const handleRemoveJobFromShipment = async (jobId: string, jobNumber: number) => {
    if (!selectedShipment) return;
    if (!confirm(`Remove Job #${jobNumber} from this shipment?`)) return;
    try {
      const remaining = (selectedShipment.job_ids || []).filter((id) => id !== jobId);
      await shipmentsApi.updateJobs(selectedShipment.id, remaining);
      // Refresh list + detail
      await fetchData();
      const updated = await shipmentsApi.getById(selectedShipment.id);
      setSelectedShipment(updated);
      setShipmentJobs((prev) => prev.filter((j) => j.id !== jobId));
      setSelectedShipmentJobs((prev) => prev.filter((id) => id !== jobId));
    } catch (error) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(err?.response?.data?.detail || 'Failed to remove job from shipment');
    }
  };

  // Bulk update status for selected jobs in shipment
  const handleBulkStatusUpdate = async () => {
    if (selectedShipmentJobs.length === 0 || !bulkStatus) return;
    
    setUpdatingBulkStatus(true);
    try {
      // Update each selected job's status
      await Promise.all(
        selectedShipmentJobs.map(jobId => 
          jobsApi.updateStatus(jobId, bulkStatus)
        )
      );
      setBulkStatusDialogOpen(false);
      setBulkStatus('');
      setSelectedShipmentJobs([]);
      fetchData();
      // Refresh selected shipment jobs
      if (selectedShipment) {
        const updatedShipment = await shipmentsApi.getById(selectedShipment.id);
        setSelectedShipment(updatedShipment);
      }
    } catch (error) {
      console.error('Failed to update job statuses:', error);
    } finally {
      setUpdatingBulkStatus(false);
    }
  };

  // Toggle job selection in shipment
  const toggleShipmentJobSelection = (jobId: string) => {
    setSelectedShipmentJobs(prev => 
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    );
  };

  // Select all jobs in shipment
  const selectAllShipmentJobs = (jobs: Job[]) => {
    const allJobIds = jobs.map(j => j.id);
    if (selectedShipmentJobs.length === allJobIds.length) {
      setSelectedShipmentJobs([]);
    } else {
      setSelectedShipmentJobs(allJobIds);
    }
  };

  const handleGeneratePdf = async (shipment: Shipment, jobs: Job[], category: MemoCategory) => {
    setGeneratingPdf(true);
    try {
      printShipmentMemo({ shipment, jobs, addressBook, preciousTypes, category });
    } catch (error) {
      console.error('Failed to generate shipment memo:', error);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const openShipmentDetails = async (shipment: Shipment) => {
    setSelectedShipment(shipment);
    setViewDialogOpen(true);
    
    // Fetch full job details for jobs in this shipment
    if (shipment.job_ids && shipment.job_ids.length > 0) {
      try {
        const allJobs = await jobsApi.getAll();
        const jobs = allJobs.filter((j: Job) => shipment.job_ids.includes(j.id));
        setShipmentJobs(jobs);
      } catch (error) {
        console.error('Failed to fetch shipment jobs:', error);
        setShipmentJobs([]);
      }
    } else {
      setShipmentJobs([]);
    }
  };

  /** Matches a shipment against the status pill. "active" = pending +
   * in_transit + delivered (the everyday working view — operators want
   * to see freshly-delivered work alongside in-flight shipments). "all"
   * still includes cancelled + completed for historical lookups. When
   * `showCompleted` is on, the "active" and "delivered" buckets also
   * reveal `completed` rows so the operator can audit recently-closed
   * work without losing the live queue. */
  const matchesStatusFilter = (status: string): boolean => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'active') {
      if (status === 'pending' || status === 'in_transit' || status === 'delivered') return true;
      return showCompleted && status === 'completed';
    }
    if (statusFilter === 'delivered') {
      if (status === 'delivered') return true;
      return showCompleted && status === 'completed';
    }
    return status === statusFilter;
  };

  const filteredShipments = useMemo(
    () => shipments.filter((shipment) => {
      const matchesSearch =
        shipment.shipment_number.toString().includes(searchTerm) ||
        shipment.courier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = matchesStatusFilter(shipment.status);
      const matchesType = typeFilter === 'all' || shipment.shipment_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shipments, searchTerm, statusFilter, typeFilter, showCompleted],
  );

  // Counts per type (ignores type filter but respects status + search)
  const typeCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {
      all: 0, send_stones_to_lab: 0, stones_from_lab: 0, certificates_from_lab: 0,
    };
    shipments.forEach((s) => {
      const matchesSearch =
        s.shipment_number.toString().includes(searchTerm) ||
        s.courier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = matchesStatusFilter(s.status);
      if (matchesSearch && matchesStatus) {
        counts.all += 1;
        if (s.shipment_type in counts) counts[s.shipment_type] += 1;
      }
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipments, searchTerm, statusFilter, showCompleted]);

  const getStatusBadge = (status: string) => {
    // `completed` is visually distinct from `delivered` so the operator can
    // tell at a glance that the stone lifecycle is closed. Slate/neutral
    // colour intentionally — completion is "case closed", not a fresh win.
    if (status === 'completed') {
      return (
        <Badge
          className="bg-slate-700 text-white hover:bg-slate-700"
          data-testid="shipment-status-completed-badge"
        >
          Completed
        </Badge>
      );
    }
    const variants: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
      pending: 'warning',
      in_transit: 'default',
      delivered: 'success',
      cancelled: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status.replace('_', ' ')}</Badge>;
  };

  const formatShipmentType = (type: string) => {
    const labels: Record<string, string> = {
      send_stones_to_lab: 'Send Stones to Lab',
      stones_from_lab: 'Stones from Lab',
      certificates_from_lab: 'Certificates from Lab',
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  // Icon + direction hint per shipment type (neutral charcoal — differentiate only with icon/arrow)
  const shipmentTypeIcon = (type: string) => {
    switch (type) {
      case 'send_stones_to_lab':
        return <Send className="h-4 w-4" strokeWidth={2} />;
      case 'stones_from_lab':
        return <Gem className="h-4 w-4" strokeWidth={2} />;
      case 'certificates_from_lab':
        return <FileCheck2 className="h-4 w-4" strokeWidth={2} />;
      default:
        return <Package className="h-4 w-4" strokeWidth={2} />;
    }
  };

  // Truck progress: slides left → middle → right based on status
  const TruckProgress: React.FC<{ status: string }> = ({ status }) => {
    if (status === 'cancelled') {
      return (
        <div className="relative h-7 rounded-full bg-red-50 border border-red-200 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-red-700 text-[11px] font-medium">
            <AlertCircle className="h-3 w-3" /> Cancelled
          </div>
        </div>
      );
    }
    const pct = status === 'pending' ? 6 : status === 'in_transit' ? 50 : 94;
    const labels = ['Pending', 'In Transit', 'Delivered'];
    const activeIdx = status === 'pending' ? 0 : status === 'in_transit' ? 1 : 2;
    return (
      <div className="relative">
        {/* Rail */}
        <div className="relative h-7 rounded-full bg-navy-100 border border-navy-200 overflow-hidden">
          {/* Filled portion */}
          <div
            className="absolute inset-y-0 left-0 bg-navy-900 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
          {/* Destination flag */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-navy-400">
            <CheckCircle className="h-3.5 w-3.5" />
          </div>
          {/* Truck (animated left->right) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
            style={{ left: `calc(${pct}% - 14px)` }}
          >
            <div className="bg-white rounded-full p-0.5 shadow-sm border border-navy-200 animate-[bob_1.6s_ease-in-out_infinite]">
              <Truck className="h-4 w-4 text-navy-900" strokeWidth={2.2} />
            </div>
          </div>
        </div>
        {/* Step labels */}
        <div className="mt-1.5 grid grid-cols-3 text-[9px] uppercase tracking-wide font-medium">
          {labels.map((label, i) => (
            <span
              key={label}
              className={
                (i === 0 ? 'text-left' : i === 2 ? 'text-right' : 'text-center') +
                ' ' +
                (i <= activeIdx ? 'text-navy-900' : 'text-navy-400')
              }
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobs((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="shipments-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-navy-900">Shipments</h2>
          <p className="text-navy-600">Manage shipments of jobs and stones</p>
        </div>
        <Button
          onClick={() => {
            setFormData(prev => ({ ...prev, source_address: userBranchName || '' }));
            setCreateDialogOpen(true);
          }}
          className="bg-navy-900 hover:bg-navy-800"
          data-testid="create-shipment-button"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Shipment
        </Button>
      </div>

      {/* Type tabs + Search + Status filter */}
      <Card className="border-navy-200">
        <CardContent className="pt-4 pb-4 space-y-4">
          {/* Type tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-navy-200 -mx-2 px-2 pb-2 overflow-x-auto">
            {([
              { key: 'all', label: 'All', icon: <Package className="h-4 w-4" /> },
              { key: 'send_stones_to_lab', label: 'Send Stones to Lab', icon: <Send className="h-4 w-4" /> },
              { key: 'stones_from_lab', label: 'Stones from Lab', icon: <Gem className="h-4 w-4" /> },
              { key: 'certificates_from_lab', label: 'Certificates from Lab', icon: <FileCheck2 className="h-4 w-4" /> },
            ] as const).map((tab) => {
              const active = typeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setTypeFilter(tab.key)}
                  data-testid={`shipments-type-tab-${tab.key}`}
                  className={
                    'inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ' +
                    (active
                      ? 'bg-navy-900 text-white shadow-sm'
                      : 'text-navy-700 hover:bg-navy-100')
                  }
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  <span
                    className={
                      'ml-1 inline-flex items-center justify-center text-[10px] font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] ' +
                      (active ? 'bg-white/20 text-white' : 'bg-navy-100 text-navy-700')
                    }
                  >
                    {typeCounts[tab.key] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Status */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-navy-400" />
                <Input
                  placeholder="Search by shipment #, courier, or tracking..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-navy-200"
                  data-testid="shipments-search-input"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 border-navy-200" data-testid="shipments-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (Pending + In Transit + Delivered)</SelectItem>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show-completed toggle.
              `certificates_from_lab` shipments auto-advance to `completed`
              when delivered, which removes them from the default working
              view. This switch lets the operator pull them (and any
              manually-completed rows) back in for review. The pill on
              the right always reflects the live total fetched in the
              background, so the toggle is discoverable even when off. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <label
              htmlFor="show-completed-toggle"
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <Switch
                id="show-completed-toggle"
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
                data-testid="shipments-show-completed-toggle"
              />
              <span className="text-sm text-navy-700">Show completed shipments</span>
            </label>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium"
              data-testid="shipments-completed-count"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {completedCount} completed
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Shipments — card grid */}
      {filteredShipments.length === 0 ? (
        <Card className="border-navy-200">
          <CardContent className="p-8 text-center text-navy-500">
            <Package className="h-12 w-12 mx-auto mb-4 text-navy-300" />
            <p>No shipments found</p>
            <p className="text-sm mt-1">Create your first shipment to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="shipments-card-grid">
          {filteredShipments.map((shipment) => (
            <div
              key={shipment.id}
              className="group relative bg-white border border-navy-200 rounded-xl p-4 hover:shadow-md hover:border-navy-300 transition-all cursor-pointer"
              onClick={() => openShipmentDetails(shipment)}
              data-testid={`shipment-card-${shipment.shipment_number}`}
            >
              {/* Top row: number + type chip + status badge */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-navy-900 text-white flex items-center justify-center">
                    {shipmentTypeIcon(shipment.shipment_type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-navy-900 text-base">#{shipment.shipment_number}</span>
                      <span className="text-[10px] uppercase tracking-wider text-navy-500 font-medium">
                        {formatShipmentType(shipment.shipment_type)}
                      </span>
                    </div>
                    <div className="text-xs text-navy-500 truncate">
                      {shipment.courier} {shipment.tracking_number ? `· ${shipment.tracking_number}` : ''}
                    </div>
                  </div>
                </div>
                {getStatusBadge(shipment.status)}
              </div>

              {/* Route */}
              <div className="flex items-center gap-2 text-xs text-navy-600 mb-3 min-w-0">
                <span className="truncate font-medium text-navy-800">{shipment.source_address}</span>
                <ArrowRight className="h-3 w-3 text-navy-400 flex-shrink-0" />
                <span className="truncate font-medium text-navy-800">{shipment.destination_address}</span>
              </div>

              {/* Truck progress */}
              <TruckProgress status={shipment.status} />

              {/* Footer: stats + actions */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-navy-100">
                <div className="flex items-center gap-4 text-xs text-navy-600">
                  <span><strong className="text-navy-900">{shipment.total_jobs}</strong> jobs</span>
                  <span><strong className="text-navy-900">{shipment.total_stones}</strong> stones</span>
                  <span><strong className="text-navy-900">${shipment.total_value.toLocaleString()}</strong></span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {shipment.status === 'pending' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus(shipment.id, 'in_transit')}
                      className="text-xs h-7"
                      data-testid={`mark-transit-${shipment.shipment_number}`}
                    >
                      Mark In Transit
                    </Button>
                  )}
                  {shipment.status === 'in_transit' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateStatus(shipment.id, 'delivered')}
                      className="text-xs h-7 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      data-testid={`mark-delivered-${shipment.shipment_number}`}
                    >
                      Mark Delivered
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateShipmentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        formData={formData}
        setFormData={setFormData}
        options={options}
        formatShipmentType={formatShipmentType}
        availableJobs={eligibleJobsForShipmentType(availableJobs, formData.shipment_type, shipments)}
        selectedJobs={selectedJobs}
        toggleJobSelection={toggleJobSelection}
        selectedStoneIds={selectedStoneIds}
        setSelectedStoneIds={setSelectedStoneIds}
        creating={creating}
        onConfirm={handleCreateShipment}
      />

      <ShipmentDetailDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        shipment={selectedShipment}
        jobs={shipmentJobs}
        generatingPdf={generatingPdf}
        printCategories={memoCategoriesPresent(shipmentJobs, preciousTypes)}
        onPrintPdf={(category) => selectedShipment && handleGeneratePdf(selectedShipment, shipmentJobs, category)}
        editing={editingShipment}
        onToggleEdit={() => editingShipment ? setEditingShipment(false) : handleStartEditShipment()}
        onAddJobs={() => {
          if (!selectedShipment) return;
          setJobsToAdd([]);
          // Filter by the shipment's own type, exclude jobs already in
          // THIS shipment (the locked-set check below covers other
          // shipments). Empty list with the "no available jobs" banner
          // already handles the case where nothing matches.
          const alreadyHere = new Set(selectedShipment.job_ids || []);
          const eligible = eligibleJobsForShipmentType(
            availableJobs,
            selectedShipment.shipment_type,
            shipments,
            alreadyHere,
          );
          setFilteredAvailableJobs(eligible);
          setAddJobsDialogOpen(true);
        }}
        editFormData={editFormData}
        setEditFormData={setEditFormData}
        options={options}
        savingEdit={savingEdit}
        onSaveEdit={handleSaveEditShipment}
        onCancelShipment={() => selectedShipment && setCancelShipmentTarget(selectedShipment)}
        isAdmin={isAdmin}
        selectedShipmentJobs={selectedShipmentJobs}
        toggleShipmentJobSelection={toggleShipmentJobSelection}
        selectAllShipmentJobs={selectAllShipmentJobs}
        onOpenBulkStatus={() => setBulkStatusDialogOpen(true)}
        onRemoveJob={handleRemoveJobFromShipment}
        onOpenJob={(job) => { setSelectedJob(job); setJobDialogOpen(true); }}
        formatShipmentType={formatShipmentType}
        getStatusBadge={getStatusBadge}
        shipmentTypeIcon={shipmentTypeIcon}
      />

      <AddJobsToShipmentDialog
        open={addJobsDialogOpen}
        onOpenChange={setAddJobsDialogOpen}
        shipmentNumber={selectedShipment?.shipment_number}
        availableJobs={filteredAvailableJobs}
        jobsToAdd={jobsToAdd}
        setJobsToAdd={setJobsToAdd}
        adding={addingJobs}
        onConfirm={handleAddJobsToShipment}
      />

      <JobDetailDialog
        open={jobDialogOpen}
        onOpenChange={setJobDialogOpen}
        job={selectedJob}
        onPrint={() => { if (selectedJob) handlePrintJobInShipment(selectedJob); }}
        onOpenInNewTab={() => {
          if (selectedJob) {
            window.open(`/dashboard/jobs?job=${selectedJob.job_number}`, '_blank');
          }
        }}
        editMode={editJobMode}
        startEdit={() => {
          if (selectedJob) {
            setEditJobFormData({ notes: selectedJob.notes || '', status: selectedJob.status });
            setEditJobMode(true);
          }
        }}
        cancelEdit={() => setEditJobMode(false)}
        editForm={editJobFormData}
        setEditForm={setEditJobFormData}
        onSaveEdit={handleUpdateJobInShipment}
        memoInputRef={memoInputRef}
        uploadingMemo={uploadingMemo}
        onMemoChange={handleMemoUploadInShipment}
        onViewMemo={() => setViewMemoOpen(true)}
        onOpenStone={openNestedStoneDialog}
      />

      <StoneEditDialog
        open={stoneDialogOpen}
        onOpenChange={setStoneDialogOpen}
        stone={selectedStone}
        job={selectedJob}
        isAdmin={isAdmin}
        dropdownSettings={dropdownSettings}
        findings={structuredFindings}
        setFindings={setStructuredFindings}
        editMode={verbalEditMode}
        setEditMode={setVerbalEditMode}
        colorStability={stoneColorStability}
        setColorStability={setStoneColorStability}
        mounted={stoneMounted}
        setMounted={setStoneMounted}
        csFeeCost={csFeeCost}
        mountedFeeCost={mountedFeeCost}
        saving={savingVerbal}
        onSave={handleSaveStoneVerbal}
        certInputRef={certInputRef}
        uploadingCert={uploadingCert}
        onCertChange={handleStoneCertChange}
        onViewCert={() => setViewCertOpen(true)}
      />

      <FileViewerDialog
        open={viewCertOpen}
        onOpenChange={setViewCertOpen}
        title={`Certificate Scan - ${selectedStone?.sku || ''}`}
        url={selectedStone?.certificate_scan_url}
        alt={`Certificate for ${selectedStone?.sku || ''}`}
      />

      <FileViewerDialog
        open={viewMemoOpen}
        onOpenChange={setViewMemoOpen}
        title={`Signed Memo - Job #${selectedJob?.job_number || ''}`}
        url={selectedJob?.signed_memo_url}
        alt={`Signed Memo for Job ${selectedJob?.job_number || ''}`}
      />

      <BulkStatusDialog
        open={bulkStatusDialogOpen}
        onOpenChange={setBulkStatusDialogOpen}
        selectedCount={selectedShipmentJobs.length}
        bulkStatus={bulkStatus}
        setBulkStatus={setBulkStatus}
        updating={updatingBulkStatus}
        onConfirm={handleBulkStatusUpdate}
      />

      {/* Cancel-shipment double-confirm */}
      <DoubleConfirmDialog
        open={!!cancelShipmentTarget}
        onOpenChange={(o) => { if (!o) setCancelShipmentTarget(null); }}
        title={`Cancel shipment ${cancelShipmentTarget?.tracking_number || ''}?`}
        description={
          <>
            The shipment will be marked <strong>Cancelled</strong> and any
            attached jobs will revert to their pre-shipment state. Stones
            in this shipment are released back to the source location.
          </>
        }
        confirmLabel="Cancel Shipment"
        testIdPrefix="cancel-shipment"
        onConfirm={async () => {
          if (!cancelShipmentTarget) return;
          await shipmentsApi.updateStatus(cancelShipmentTarget.id, 'cancelled', true);
          await fetchData();
          setSelectedShipment((prev) =>
            prev && prev.id === cancelShipmentTarget.id ? { ...prev, status: 'cancelled' } : prev
          );
        }}
      />
    </div>
  );
}
