"use client";

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { shipmentsApi, jobsApi, stonesApi, settingsApi, cloudinaryApi, branchesApi } from '@/lib/api';
import { useBranchFilterStore, useAuthStore } from '@/lib/store';
import { escapeHtml as esc } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Package,
  Plus,
  Search,
  Truck,
  Loader2,
  CheckCircle,
  AlertCircle,
  FileText,
  PlusCircle,
  Gem,
  Diamond,
  Link2,
  Upload,
  Check,
  Eye,
  Pencil,
  Printer,
  ArrowRight,
  FileCheck2,
  Send,
  Trash2,
} from 'lucide-react';

import type {
  Shipment, StructuredVerbalFindings, Stone, Job, DropdownSettings,
  ShipmentOptions,
} from './_types';
import { printShipmentMemo } from './_print/shipment-memo';
import { PartialStonesPicker } from './_components/PartialStonesPicker';

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
  const [filteredAvailableJobs, setFilteredAvailableJobs] = useState<Job[]>([]);
  const [options, setOptions] = useState<ShipmentOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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
    notes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // View shipment dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [shipmentJobs, setShipmentJobs] = useState<Job[]>([]);

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
  const { selectedBranchId } = useBranchFilterStore();

  useEffect(() => {
    fetchData();
  }, [selectedBranchId]);

  const fetchData = async () => {
    try {
      const branchParam = selectedBranchId ? { branch_id: selectedBranchId } : {};
      const [shipmentsData, jobsData, optionsData, dropdownData, branchesData] = await Promise.all([
        shipmentsApi.getAll(branchParam),
        jobsApi.getAll(branchParam),
        shipmentsApi.getOptions(),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
        branchesApi.getAll(),
      ]);
      setShipments(shipmentsData);
      setAvailableJobs(jobsData.filter((j: Job) => j.status !== 'done'));
      setOptions(optionsData);
      setDropdownSettings(dropdownData);
      
      // Set user's branch name for default source address
      if (user?.branch_id) {
        const branch = branchesData.find((b: { id: string; name: string }) => b.id === user.branch_id);
        if (branch) setUserBranchName(branch.name);
      }
      
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

  // Helper to open nested stone dialog
  const openNestedStoneDialog = (stone: Stone) => {
    setSelectedStone(stone);
    
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
      notes: selectedShipment.notes || '',
    });
    setEditingShipment(true);
  };

  const handleSaveEditShipment = async () => {
    if (!selectedShipment) return;
    setSavingEdit(true);
    try {
      await shipmentsApi.update(selectedShipment.id, editFormData);
      setEditingShipment(false);
      fetchData();
      // Refresh selected shipment
      const updatedShipments = await shipmentsApi.getAll(selectedBranchId ? { branch_id: selectedBranchId } : {});
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print');
      return;
    }

    // Generate stones table HTML
    const stonesTableHtml = job.stones && job.stones.length > 0 
      ? `
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
              <th>Certificate</th>
            </tr>
          </thead>
          <tbody>
            ${job.stones.map((stone, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${esc(stone.sku)}</td>
                <td>${esc(stone.stone_type)}</td>
                <td>${stone.weight} ct</td>
                <td>${esc(stone.shape)}</td>
                <td>$${stone.value.toLocaleString()}</td>
                <td>$${stone.fee.toLocaleString()}</td>
                <td>${stone.certificate_group ? `Cert ${stone.certificate_group}` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `
      : '<p>No stones in this job</p>';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Job #${job.job_number} - Bashari Lab-Direct</title>
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
          tr:nth-child(even) { background: #f9f9f9; }
          .totals { margin-top: 20px; text-align: right; padding: 15px; background: #102a43; color: white; border-radius: 6px; }
          .totals .item { display: inline-block; margin-left: 30px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; color: #627d98; font-size: 12px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Bashari Lab-Direct</div>
          <div>Job #${job.job_number}</div>
        </div>
        
        <div class="section">
          <h3>Job Details</h3>
          <div class="grid">
            <div class="field">
              <div class="label">Client</div>
              <div class="value">${esc(job.client_name || 'N/A')}</div>
            </div>
            <div class="field">
              <div class="label">Branch</div>
              <div class="value">${esc(job.branch_name || 'N/A')}</div>
            </div>
            <div class="field">
              <div class="label">Service Type</div>
              <div class="value">${esc(job.service_type || 'N/A')}</div>
            </div>
            <div class="field">
              <div class="label">Status</div>
              <div class="value">${job.status.replace(/_/g, ' ')}</div>
            </div>
            <div class="field">
              <div class="label">Total Stones</div>
              <div class="value">${job.total_stones}</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h3>Stones</h3>
          ${stonesTableHtml}
          
          <div class="totals">
            <div class="item"><strong>Total Stones:</strong> ${job.total_stones}</div>
            <div class="item"><strong>Total Value:</strong> $${job.total_value.toLocaleString()}</div>
            <div class="item"><strong>Total Fee:</strong> $${job.total_fee.toLocaleString()}</div>
          </div>
        </div>
        
        ${job.notes ? `
        <div class="section">
          <h3>Notes</h3>
          <p>${esc(job.notes)}</p>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
          <p>Bashari Lab-Direct</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
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

  const handleGeneratePdf = async (shipment: Shipment, jobs: Job[]) => {
    setGeneratingPdf(true);
    try {
      printShipmentMemo({ shipment, jobs });
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

  const filteredShipments = useMemo(
    () => shipments.filter((shipment) => {
      const matchesSearch =
        shipment.shipment_number.toString().includes(searchTerm) ||
        shipment.courier.toLowerCase().includes(searchTerm.toLowerCase()) ||
        shipment.tracking_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || shipment.status === statusFilter;
      const matchesType = typeFilter === 'all' || shipment.shipment_type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    }),
    [shipments, searchTerm, statusFilter, typeFilter],
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
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      if (matchesSearch && matchesStatus) {
        counts.all += 1;
        if (s.shipment_type in counts) counts[s.shipment_type] += 1;
      }
    });
    return counts;
  }, [shipments, searchTerm, statusFilter]);

  const getStatusBadge = (status: string) => {
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
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
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

      {/* Create Shipment Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-900">Create New Shipment</DialogTitle>
            <DialogDescription>
              Create a shipment to send jobs to the lab or return stones
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Shipment Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shipment_type">Shipment Type *</Label>
                <Select
                  value={formData.shipment_type}
                  onValueChange={(value) => setFormData({ ...formData, shipment_type: value })}
                >
                  <SelectTrigger data-testid="shipment-type-select">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.shipment_types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {formatShipmentType(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="courier">Courier *</Label>
                <Select
                  value={formData.courier}
                  onValueChange={(value) => setFormData({ ...formData, courier: value })}
                >
                  <SelectTrigger data-testid="courier-select">
                    <SelectValue placeholder="Select courier" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.couriers.map((courier) => (
                      <SelectItem key={courier} value={courier}>
                        {courier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source_address">Source Address *</Label>
                <Select
                  value={formData.source_address}
                  onValueChange={(value) => setFormData({ ...formData, source_address: value })}
                >
                  <SelectTrigger data-testid="source-address-select">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.address_options.map((addr) => (
                      <SelectItem key={addr} value={addr}>
                        {addr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination_address">Destination Address *</Label>
                <Select
                  value={formData.destination_address}
                  onValueChange={(value) => setFormData({ ...formData, destination_address: value })}
                >
                  <SelectTrigger data-testid="destination-address-select">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.address_options.map((addr) => (
                      <SelectItem key={addr} value={addr}>
                        {addr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="tracking_number">Tracking Number</Label>
                <Input
                  id="tracking_number"
                  value={formData.tracking_number}
                  onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })}
                  placeholder="Enter tracking number (optional)"
                  className="border-navy-200"
                  data-testid="tracking-number-input"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="border-navy-200"
                  rows={2}
                  data-testid="notes-textarea"
                />
              </div>
            </div>

            {/* Select Jobs */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Select Jobs to Include</Label>
              {availableJobs.length === 0 ? (
                <div className="p-4 text-center text-navy-500 bg-navy-50 rounded-lg">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-navy-400" />
                  <p>No available jobs to add</p>
                  <p className="text-sm">All jobs are already assigned to shipments</p>
                </div>
              ) : (
                <div className="border border-navy-200 rounded-lg max-h-64 overflow-y-auto">
                  {availableJobs.map((job) => (
                    <div
                      key={job.id}
                      className={`flex items-center justify-between p-3 hover:bg-navy-50 cursor-pointer border-b last:border-b-0 ${
                        selectedJobs.includes(job.id) ? 'bg-navy-100' : ''
                      }`}
                      onClick={() => toggleJobSelection(job.id)}
                      data-testid={`select-job-${job.job_number}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            selectedJobs.includes(job.id)
                              ? 'bg-navy-800 border-navy-800'
                              : 'border-navy-300'
                          }`}
                        >
                          {selectedJobs.includes(job.id) && (
                            <CheckCircle className="h-4 w-4 text-white" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-navy-900">Job #{job.job_number}</p>
                          <p className="text-sm text-navy-500">{job.client_name || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-navy-600">{job.total_stones} stones</p>
                        <p className="text-sm font-medium text-navy-900">
                          ${job.total_value.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedJobs.length > 0 && (
                <p className="text-sm text-navy-600">
                  {selectedJobs.length} job(s) selected
                </p>
              )}
            </div>

            {/* Partial stones picker for return shipments (stones/certificates from lab) */}
            <PartialStonesPicker
              jobs={availableJobs.filter((j) => selectedJobs.includes(j.id))}
              shipmentType={formData.shipment_type}
              selectedStoneIds={selectedStoneIds}
              onChange={setSelectedStoneIds}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateShipment}
              disabled={
                creating ||
                !formData.shipment_type ||
                !formData.courier ||
                !formData.source_address ||
                !formData.destination_address
              }
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="confirm-create-shipment-button"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Shipment
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Shipment Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
              <span>Shipment #{selectedShipment?.shipment_number}</span>
              {selectedShipment && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGeneratePdf(selectedShipment, shipmentJobs)}
                    disabled={generatingPdf}
                    data-testid="generate-pdf-button"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    {generatingPdf ? 'Generating...' : 'Print PDF'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => editingShipment ? setEditingShipment(false) : handleStartEditShipment()}
                    data-testid="edit-shipment-button"
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    {editingShipment ? 'Cancel Edit' : 'Edit'}
                  </Button>
                  {selectedShipment.status !== 'delivered' && selectedShipment.status !== 'cancelled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setJobsToAdd([]);
                        // Filter out jobs already in this shipment
                        const jobsNotInShipment = availableJobs.filter(
                          job => !selectedShipment.job_ids?.includes(job.id)
                        );
                        setFilteredAvailableJobs(jobsNotInShipment);
                        setAddJobsDialogOpen(true);
                      }}
                      data-testid="add-jobs-button"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add Jobs
                    </Button>
                  )}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedShipment && (
            <div className="space-y-4 py-4">
              {editingShipment ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-navy-500">Type</Label>
                      <Select value={editFormData.shipment_type} onValueChange={(v) => setEditFormData({...editFormData, shipment_type: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {options?.shipment_types.map((t) => (<SelectItem key={t} value={t}>{formatShipmentType(t)}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-navy-500">Courier</Label>
                      <Select value={editFormData.courier} onValueChange={(v) => setEditFormData({...editFormData, courier: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {options?.couriers.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-navy-500">From</Label>
                      <Select value={editFormData.source_address} onValueChange={(v) => setEditFormData({...editFormData, source_address: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {options?.address_options.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-navy-500">To</Label>
                      <Select value={editFormData.destination_address} onValueChange={(v) => setEditFormData({...editFormData, destination_address: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {options?.address_options.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-navy-500">Tracking Number</Label>
                      <Input value={editFormData.tracking_number} onChange={(e) => setEditFormData({...editFormData, tracking_number: e.target.value})} className="border-navy-200" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-navy-500">Notes</Label>
                      <Input value={editFormData.notes} onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})} className="border-navy-200" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveEditShipment} disabled={savingEdit} className="bg-navy-900 hover:bg-navy-800" data-testid="save-shipment-edit-button">
                      {savingEdit ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-navy-500 text-xs">Type</Label>
                  <p className="font-medium text-navy-900 text-sm">
                    {formatShipmentType(selectedShipment.shipment_type)}
                  </p>
                </div>
                <div>
                  <Label className="text-navy-500">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedShipment.status)}</div>
                </div>
                <div>
                  <Label className="text-navy-500">Courier</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.courier}</p>
                </div>
                <div>
                  <Label className="text-navy-500">Tracking Number</Label>
                  <p className="font-medium text-navy-800 font-mono">
                    {selectedShipment.tracking_number || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-navy-500">From</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.source_address}</p>
                </div>
                <div>
                  <Label className="text-navy-500">To</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.destination_address}</p>
                </div>
              </div>
              )}

              {selectedShipment.notes && !editingShipment && (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-900">{selectedShipment.notes}</p>
                </div>
              )}

              {/* Jobs Table */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">
                    Jobs in Shipment ({shipmentJobs.length})
                  </Label>
                  {shipmentJobs.length > 0 && selectedShipmentJobs.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setBulkStatusDialogOpen(true)}
                      data-testid="bulk-status-button"
                    >
                      Update Status ({selectedShipmentJobs.length})
                    </Button>
                  )}
                </div>
                {shipmentJobs.length > 0 ? (
                  <>
                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-2">
                    {shipmentJobs.map((job) => (
                      <div key={job.id} className="border border-navy-200 rounded-lg p-2.5 active:bg-navy-50 relative" onClick={() => { setSelectedJob(job); setJobDialogOpen(true); }}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-navy-900 text-sm">#{job.job_number}</span>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(job.status)}
                            {isAdmin && editingShipment && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveJobFromShipment(job.id, job.job_number); }}
                                className="text-red-500 p-1 -mr-1 rounded active:bg-red-50"
                                title="Remove job from shipment"
                                data-testid={`remove-job-from-shipment-mobile-${job.job_number}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-navy-500 mt-0.5">{job.client_name || '-'} &middot; {job.total_stones} stones &middot; ${job.total_value.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop Table */}
                  <div className="hidden md:block border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-navy-50">
                          <TableHead className="text-navy-700 w-12">
                            <input
                              type="checkbox"
                              checked={shipmentJobs.length > 0 && selectedShipmentJobs.length === shipmentJobs.length}
                              onChange={() => selectAllShipmentJobs(shipmentJobs)}
                              className="h-4 w-4 rounded border-navy-300"
                              data-testid="select-all-shipment-jobs"
                            />
                          </TableHead>
                          <TableHead className="text-navy-700">Job #</TableHead>
                          <TableHead className="text-navy-700">Client</TableHead>
                          <TableHead className="text-navy-700">Stones</TableHead>
                          <TableHead className="text-navy-700">Value</TableHead>
                          <TableHead className="text-navy-700">Status</TableHead>
                          {isAdmin && editingShipment && <TableHead className="text-navy-700 w-10"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {shipmentJobs.map((job) => (
                          <TableRow 
                            key={job.id}
                            className={`cursor-pointer hover:bg-navy-100 ${selectedShipmentJobs.includes(job.id) ? 'bg-navy-100' : ''}`}
                            data-testid={`shipment-job-row-${job.job_number}`}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedShipmentJobs.includes(job.id)}
                                onChange={() => toggleShipmentJobSelection(job.id)}
                                className="h-4 w-4 rounded border-navy-300"
                                data-testid={`select-shipment-job-${job.job_number}`}
                              />
                            </TableCell>
                            <TableCell 
                              className="font-medium"
                              onClick={() => {
                                setSelectedJob(job);
                                setJobDialogOpen(true);
                              }}
                            >
                              #{job.job_number}
                            </TableCell>
                            <TableCell 
                              onClick={() => {
                                setSelectedJob(job);
                                setJobDialogOpen(true);
                              }}
                            >
                              {job.client_name || '-'}
                            </TableCell>
                            <TableCell 
                              onClick={() => {
                                setSelectedJob(job);
                                setJobDialogOpen(true);
                              }}
                            >
                              {job.total_stones}
                            </TableCell>
                            <TableCell 
                              onClick={() => {
                                setSelectedJob(job);
                                setJobDialogOpen(true);
                              }}
                            >
                              ${job.total_value.toLocaleString()}
                            </TableCell>
                            <TableCell 
                              onClick={() => {
                                setSelectedJob(job);
                                setJobDialogOpen(true);
                              }}
                            >
                              <Badge variant="secondary">{job.status.replace(/_/g, ' ')}</Badge>
                            </TableCell>
                            {isAdmin && editingShipment && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleRemoveJobFromShipment(job.id, job.job_number)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                                  title="Remove job from shipment"
                                  data-testid={`remove-job-from-shipment-${job.job_number}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  </>
                ) : (
                  <p className="text-navy-400 text-center py-4">No jobs in this shipment</p>
                )}
              </div>

              {/* Summary */}
              <div className="bg-navy-50 rounded-lg p-4 flex justify-between">
                <div>
                  <span className="text-navy-500">Total Jobs:</span>
                  <span className="font-semibold text-navy-800 ml-2">{selectedShipment.total_jobs}</span>
                </div>
                <div>
                  <span className="text-navy-500">Total Stones:</span>
                  <span className="font-semibold text-navy-800 ml-2">{selectedShipment.total_stones}</span>
                </div>
                <div>
                  <span className="text-navy-500">Total Value:</span>
                  <span className="font-semibold text-navy-800 ml-2">${selectedShipment.total_value.toLocaleString()}</span>
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

      {/* Add Jobs to Shipment Dialog */}
      <Dialog open={addJobsDialogOpen} onOpenChange={setAddJobsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-900">
              Add Jobs to Shipment #{selectedShipment?.shipment_number}
            </DialogTitle>
            <DialogDescription>
              Select jobs to add to this shipment
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {filteredAvailableJobs.length === 0 ? (
              <div className="p-4 text-center text-navy-500 bg-navy-50 rounded-lg">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-navy-400" />
                <p>No available jobs to add</p>
                <p className="text-sm">All jobs are either already in this shipment or completed</p>
              </div>
            ) : (
              <div className="border border-navy-200 rounded-lg max-h-64 overflow-y-auto">
                {filteredAvailableJobs.map((job) => (
                  <div
                    key={job.id}
                    className={`flex items-center justify-between p-3 hover:bg-navy-50 cursor-pointer border-b last:border-b-0 ${
                      jobsToAdd.includes(job.id) ? 'bg-navy-100' : ''
                    }`}
                    onClick={() => {
                      setJobsToAdd((prev) =>
                        prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id]
                      );
                    }}
                    data-testid={`add-job-${job.job_number}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          jobsToAdd.includes(job.id)
                            ? 'bg-navy-800 border-navy-800'
                            : 'border-navy-300'
                        }`}
                      >
                        {jobsToAdd.includes(job.id) && (
                          <CheckCircle className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-navy-900">Job #{job.job_number}</p>
                        <p className="text-sm text-navy-500">{job.client_name || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-navy-600">{job.total_stones} stones</p>
                      <p className="text-sm font-medium text-navy-900">
                        ${job.total_value.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {jobsToAdd.length > 0 && (
              <p className="text-sm text-navy-600 mt-2">
                {jobsToAdd.length} job(s) selected
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddJobsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddJobsToShipment}
              disabled={addingJobs || jobsToAdd.length === 0}
              className="bg-navy-900 hover:bg-navy-800"
              data-testid="confirm-add-jobs-button"
            >
              {addingJobs ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add {jobsToAdd.length} Job(s)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Job Dialog - shows complete job details like Jobs page */}
      <Dialog open={jobDialogOpen} onOpenChange={(open) => {
        setJobDialogOpen(open);
        if (!open) {
          setEditJobMode(false);
        }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
              <span>Job #{selectedJob?.job_number}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedJob) {
                      handlePrintJobInShipment(selectedJob);
                    }
                  }}
                  data-testid="print-job-shipment-button"
                >
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedJob) {
                      setEditJobFormData({
                        notes: selectedJob.notes || '',
                        status: selectedJob.status,
                      });
                      setEditJobMode(true);
                    }
                  }}
                  data-testid="edit-job-shipment-button"
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedJob) {
                      window.open(`/dashboard/jobs?job=${selectedJob.job_number}`, '_blank');
                    }
                  }}
                  data-testid="open-job-new-tab"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Open in New Tab
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription>
              {selectedJob?.client_name} | {selectedJob?.branch_name || 'N/A'}
            </DialogDescription>
          </DialogHeader>

          {selectedJob && (
            <div className="space-y-4 py-4">
              {/* Edit Mode */}
              {editJobMode ? (
                <div className="space-y-4 p-4 bg-navy-50 rounded-lg border-2 border-amber-400">
                  <h3 className="font-semibold text-navy-800 flex items-center gap-2">
                    <Pencil className="h-4 w-4" />
                    Edit Job
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Status</Label>
                      <Select
                        value={editJobFormData.status}
                        onValueChange={(value) => setEditJobFormData({ ...editJobFormData, status: value })}
                      >
                        <SelectTrigger className="bg-white">
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
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Textarea
                        value={editJobFormData.notes}
                        onChange={(e) => setEditJobFormData({ ...editJobFormData, notes: e.target.value })}
                        className="bg-white"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setEditJobMode(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleUpdateJobInShipment}>
                        Save Changes
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Job Info (View Mode) */
                <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
                <div>
                  <Label className="text-navy-500 text-xs">Service Type</Label>
                  <p className="font-medium text-navy-900">{selectedJob.service_type || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Status</Label>
                  <Badge variant="secondary">{selectedJob.status.replace(/_/g, ' ')}</Badge>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Total Stones</Label>
                  <p className="font-medium text-navy-900">{selectedJob.total_stones}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Total Value</Label>
                  <p className="font-medium text-navy-900">${selectedJob.total_value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Total Fee</Label>
                  <p className="font-medium text-navy-900">${selectedJob.total_fee.toLocaleString()}</p>
                </div>
              </div>
              )}

              {selectedJob.notes && !editJobMode && (
                <div>
                  <Label className="text-navy-500">Notes</Label>
                  <p className="font-medium text-navy-900">{selectedJob.notes}</p>
                </div>
              )}

              {/* Signed Memo Section */}
              <div className="border-t pt-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Signed Memo
                </Label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="file"
                    ref={memoInputRef}
                    onChange={handleMemoUploadInShipment}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => memoInputRef.current?.click()}
                    disabled={uploadingMemo}
                    data-testid="upload-memo-shipment-button"
                  >
                    {uploadingMemo ? (
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
                  
                  {selectedJob.signed_memo_url && (
                    <Button
                      variant="outline"
                      onClick={() => setViewMemoOpen(true)}
                      data-testid="view-memo-shipment-button"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Memo
                    </Button>
                  )}
                </div>
              </div>

              {/* Stones Table with Certificate Grouping */}
              <div className="border-t pt-4">
                <Label className="text-base font-semibold mb-3 block flex items-center gap-2">
                  <Gem className="h-4 w-4" />
                  Stones ({selectedJob.stones?.length || 0})
                </Label>
                {selectedJob.stones && selectedJob.stones.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-navy-50">
                          <TableHead className="text-navy-700">SKU</TableHead>
                          <TableHead className="text-navy-700">Type</TableHead>
                          <TableHead className="text-navy-700">Weight</TableHead>
                          <TableHead className="text-navy-700">Shape</TableHead>
                          <TableHead className="text-navy-700">Value</TableHead>
                          <TableHead className="text-navy-700">Certificate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Ungrouped stones first */}
                        {selectedJob.stones
                          .filter(s => !s.certificate_group)
                          .map((stone) => (
                            <TableRow 
                              key={stone.id}
                              className="cursor-pointer hover:bg-navy-100"
                              onClick={() => openNestedStoneDialog(stone)}
                              data-testid={`job-stone-row-${esc(stone.sku)}`}
                            >
                              <TableCell className="font-mono text-sm">{stone.sku}</TableCell>
                              <TableCell>{stone.stone_type}</TableCell>
                              <TableCell>{stone.weight} ct</TableCell>
                              <TableCell>{stone.shape}</TableCell>
                              <TableCell>${stone.value.toLocaleString()}</TableCell>
                              <TableCell>-</TableCell>
                            </TableRow>
                          ))}
                        
                        {/* Grouped stones */}
                        {(() => {
                          const groupedStones = selectedJob.stones.filter(s => s.certificate_group);
                          const groups = new Map<number, typeof groupedStones>();
                          groupedStones.forEach(s => {
                            const group = groups.get(s.certificate_group!) || [];
                            group.push(s);
                            groups.set(s.certificate_group!, group);
                          });
                          
                          return Array.from(groups.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([groupNum, stones]) => (
                              <React.Fragment key={groupNum}>
                                <TableRow className="bg-navy-800">
                                  <TableCell colSpan={6} className="py-2">
                                    <div className="flex items-center justify-between text-white">
                                      <span className="font-medium flex items-center gap-2">
                                        <Link2 className="h-4 w-4" />
                                        Certificate {groupNum} ({stones.length} stones)
                                      </span>
                                      <span className="text-sm opacity-80">
                                        Total: ${stones.reduce((sum, s) => sum + s.value, 0).toLocaleString()}
                                      </span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                                {stones.map((stone) => (
                                  <TableRow 
                                    key={stone.id}
                                    className="cursor-pointer hover:bg-navy-100 bg-navy-50/50"
                                    onClick={() => openNestedStoneDialog(stone)}
                                    data-testid={`job-stone-row-${esc(stone.sku)}`}
                                  >
                                    <TableCell className="font-mono text-sm">{stone.sku}</TableCell>
                                    <TableCell>{stone.stone_type}</TableCell>
                                    <TableCell>{stone.weight} ct</TableCell>
                                    <TableCell>{stone.shape}</TableCell>
                                    <TableCell>${stone.value.toLocaleString()}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="bg-navy-100">Cert {groupNum}</Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-navy-400 text-center py-4">No stones in this job</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setJobDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nested Stone Dialog - opens on top of job dialog */}
      <Dialog open={stoneDialogOpen} onOpenChange={setStoneDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
              <Diamond className="h-5 w-5" />
              Stone - {selectedStone?.sku}
            </DialogTitle>
            <DialogDescription>
              Job #{selectedJob?.job_number} | {selectedStone?.stone_type} | {selectedStone?.weight} ct
            </DialogDescription>
          </DialogHeader>

          {selectedStone && (
            <div className="space-y-4 py-4">
              {/* Stone Info */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
                <div>
                  <Label className="text-navy-500 text-xs">Type</Label>
                  <p className="font-medium text-navy-900">{selectedStone.stone_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Weight</Label>
                  <p className="font-medium text-navy-900">{selectedStone.weight} ct</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Shape</Label>
                  <p className="font-medium text-navy-900">{selectedStone.shape}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Value</Label>
                  <p className="font-medium text-navy-900">${selectedStone.value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Fee</Label>
                  <p className="font-medium text-navy-900">${selectedStone.fee.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Certificate Group</Label>
                  <p className="font-medium text-navy-900">
                    {selectedStone.certificate_group ? `Group ${selectedStone.certificate_group}` : '-'}
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
                  {typeof selectedStone.verbal_findings === 'object' && selectedStone.verbal_findings?.certificate_id && (
                    <Badge variant="success">Completed</Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Certificate ID */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Certificate ID</Label>
                    <Input
                      placeholder="Enter certificate ID..."
                      value={structuredFindings.certificate_id || ''}
                      onChange={(e) => setStructuredFindings(prev => ({ ...prev, certificate_id: e.target.value }))}
                      className="border-navy-200"
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
                      className="border-navy-200"
                      data-testid="verbal-weight"
                    />
                  </div>
                  
                  {/* Identification */}
                  <div className="space-y-1">
                    <Label className="text-sm text-navy-600">Identification</Label>
                    <SearchableSelect
                      value={structuredFindings.identification || ''}
                      onValueChange={(value) => setStructuredFindings(prev => ({ ...prev, identification: value }))}
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
                      options={dropdownSettings.comment.map(opt => ({ value: opt.value }))}
                      placeholder="Select comment..."
                      searchPlaceholder="Search comment..."
                      data-testid="verbal-comment"
                    />
                  </div>
                </div>
                
                <Button
                  onClick={async () => {
                    if (!selectedStone) return;
                    setSavingVerbal(true);
                    try {
                      await stonesApi.updateStructuredVerbal(selectedStone.id, structuredFindings);
                      // Update local state
                      setSelectedStone({ ...selectedStone, verbal_findings: structuredFindings });
                      if (selectedJob) {
                        const updatedStones = selectedJob.stones?.map(s => 
                          s.id === selectedStone.id ? { ...s, verbal_findings: structuredFindings } : s
                        );
                        setSelectedJob({ ...selectedJob, stones: updatedStones });
                      }
                      fetchData();
                    } catch (error) {
                      console.error('Failed to save verbal findings:', error);
                      alert('Failed to save verbal findings');
                    } finally {
                      setSavingVerbal(false);
                    }
                  }}
                  disabled={savingVerbal}
                  className="bg-navy-900 hover:bg-navy-800 w-full"
                  data-testid="save-stone-verbal-button"
                >
                  {savingVerbal ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Save Verbal Findings
                    </>
                  )}
                </Button>
              </div>

              {/* Certificate Scan */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Certificate Scan
                    {selectedStone.certificate_group && (
                      <Badge variant="outline" className="ml-2">
                        <Link2 className="h-3 w-3 mr-1" />
                        Group {selectedStone.certificate_group}
                      </Badge>
                    )}
                  </Label>
                  {selectedStone.certificate_scan_url && (
                    <Badge variant="success">Uploaded</Badge>
                  )}
                </div>
                
                {selectedStone.certificate_group && (
                  <p className="text-sm text-navy-600 bg-amber-50 p-2 rounded">
                    This stone is part of Certificate Group {selectedStone.certificate_group}. 
                    Uploading a scan will apply to all stones in this group.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <input
                    ref={certInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selectedStone || !selectedJob) return;

                      setUploadingCert(true);
                      try {
                        // Upload to Cloudinary
                        const folder = `certificates/${selectedJob.id}`;
                        const { url } = await cloudinaryApi.uploadFile(file, folder);
                        
                        if (selectedStone.certificate_group) {
                          await stonesApi.uploadGroupCertificateScan(
                            selectedJob.id,
                            selectedStone.certificate_group,
                            file.name,
                            url
                          );
                          // Update all stones in the group
                          const updatedStones = selectedJob.stones?.map(s => 
                            s.certificate_group === selectedStone.certificate_group
                              ? { ...s, certificate_scan_url: url }
                              : s
                          );
                          setSelectedJob({ ...selectedJob, stones: updatedStones });
                        } else {
                          await stonesApi.uploadCertificateScan(selectedStone.id, file.name, url);
                          const updatedStones = selectedJob.stones?.map(s => 
                            s.id === selectedStone.id ? { ...s, certificate_scan_url: url } : s
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
                    }}
                    className="hidden"
                    id="cert-upload-shipment"
                  />
                  <Button
                    variant="outline"
                    onClick={() => certInputRef.current?.click()}
                    disabled={uploadingCert}
                  >
                    {uploadingCert ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        {selectedStone.certificate_scan_url ? 'Replace Scan' : 'Upload Scan'}
                      </>
                    )}
                  </Button>
                  
                  {selectedStone.certificate_scan_url && (
                    <Button
                      variant="outline"
                      onClick={() => setViewCertOpen(true)}
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
      <Dialog open={viewCertOpen} onOpenChange={setViewCertOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Certificate Scan - {selectedStone?.sku}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {selectedStone?.certificate_scan_url && (
              selectedStone.certificate_scan_url.startsWith('data:application/pdf') ? (
                <iframe
                  src={selectedStone.certificate_scan_url}
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '500px', maxHeight: '75vh' }}
                  title={`Certificate for ${selectedStone.sku}`}
                />
              ) : (
                <img
                  src={selectedStone.certificate_scan_url}
                  alt={`Certificate for ${selectedStone.sku}`}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewCertOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Memo Dialog */}
      <Dialog open={viewMemoOpen} onOpenChange={setViewMemoOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Signed Memo - Job #{selectedJob?.job_number}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {selectedJob?.signed_memo_url && (
              selectedJob.signed_memo_url.startsWith('data:application/pdf') ? (
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

      {/* Bulk Status Update Dialog */}
      <Dialog open={bulkStatusDialogOpen} onOpenChange={setBulkStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl text-navy-900">
              Update Job Status
            </DialogTitle>
            <DialogDescription>
              Update status for {selectedShipmentJobs.length} selected job(s)
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
              className="bg-navy-900 hover:bg-navy-800"
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
    </div>
  );
}
