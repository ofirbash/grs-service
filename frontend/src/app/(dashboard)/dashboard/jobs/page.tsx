"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { jobsApi, clientsApi, branchesApi, stonesApi, settingsApi, cloudinaryApi } from '@/lib/api';
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
} from 'lucide-react';

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
  created_at: string;
}

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

  useEffect(() => {
    fetchData();
  }, []);

  // Handle opening a specific job from URL parameter
  useEffect(() => {
    const jobNumber = searchParams.get('job');
    if (jobNumber && jobs.length > 0) {
      const job = jobs.find(j => j.job_number === parseInt(jobNumber));
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
    
    // If verbal findings exist with certificate_id, lock the form (view mode)
    const hasExistingFindings = !!(findings?.certificate_id);
    setVerbalEditMode(!hasExistingFindings);  // Edit mode if no existing findings
    
    setStoneDialogOpen(true);
  };

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
      if (updated) setSelectedJob(updated);
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

    // Organize stones into certificate groups
    const certificateGroups = organizeStonesIntoGroups(job.stones);
    
    // Generate certificate summary
    const certSummaryItems = certificateGroups
      .filter(g => g.groupNumber !== null)
      .map(g => `Certificate ${g.groupNumber}: ${g.stones.length} stone${g.stones.length > 1 ? 's' : ''} (${g.label})`)
      .join(', ');
    
    const ungroupedCount = certificateGroups.filter(g => g.groupNumber === null).length;
    const certSummary = certSummaryItems + (ungroupedCount > 0 ? `, ${ungroupedCount} ungrouped` : '');

    // Generate HTML for each certificate group
    const certificateGroupsHtml = certificateGroups.map(group => {
      const groupTitle = group.groupNumber !== null 
        ? `Certificate ${group.groupNumber} - ${group.label} (${group.stones.length} stone${group.stones.length > 1 ? 's' : ''})`
        : `Ungrouped Stone`;
      
      const stonesRows = group.stones.map((stone, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${stone.sku}</td>
          <td>${stone.stone_type}</td>
          <td>${stone.weight} ct</td>
          <td>${stone.shape}</td>
          <td>$${stone.value.toLocaleString()}</td>
          <td>$${stone.fee.toLocaleString()}</td>
        </tr>
      `).join('');

      const groupTotalValue = group.stones.reduce((sum, s) => sum + s.value, 0);
      const groupTotalFee = group.stones.reduce((sum, s) => sum + s.fee, 0);

      return `
        <div class="certificate-group">
          <h4 class="group-title ${group.groupNumber !== null ? 'grouped' : 'ungrouped'}">${groupTitle}</h4>
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
              ${stonesRows}
            </tbody>
            <tfoot>
              <tr class="group-total">
                <td colspan="5" style="text-align: right;"><strong>Group Total:</strong></td>
                <td><strong>$${groupTotalValue.toLocaleString()}</strong></td>
                <td><strong>$${groupTotalFee.toLocaleString()}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
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
          tr:nth-child(even) { background: #f9f9f9; }
          .certificate-group { margin: 15px 0; padding: 15px; border: 2px solid #102a43; border-radius: 8px; }
          .group-title { margin: 0 0 10px 0; padding: 8px 12px; border-radius: 4px; font-size: 14px; }
          .group-title.grouped { background: #102a43; color: white; }
          .group-title.ungrouped { background: #e2e8f0; color: #486581; }
          .group-total { background: #f0f4f8; }
          .cert-summary { background: #fef3c7; padding: 12px; border-radius: 6px; margin: 10px 0; }
          .cert-summary strong { color: #92400e; }
          .totals { margin-top: 20px; text-align: right; padding: 15px; background: #102a43; color: white; border-radius: 6px; }
          .totals .item { display: inline-block; margin-left: 30px; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; color: #627d98; font-size: 12px; }
          @media print { 
            body { padding: 20px; }
            .certificate-group { page-break-inside: avoid; }
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
        
        <div class="section">
          <h3>Certificate Summary</h3>
          <div class="cert-summary">
            <strong>Certificates:</strong> ${certSummary || 'No certificates defined yet'}
          </div>
        </div>
        
        <div class="section">
          <h3>Stones by Certificate</h3>
          ${certificateGroupsHtml}
          
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

  const toggleStoneSelection = (stoneId: string) => {
    setSelectedStones(prev => 
      prev.includes(stoneId) 
        ? prev.filter(id => id !== stoneId)
        : [...prev, stoneId]
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
      received: 'secondary',
      stones_accepted: 'secondary',
      sent_to_lab: 'default',
      verbal_uploaded: 'default',
      stones_returned: 'warning',
      certificates_scanned: 'success',
      certificates_sent: 'success',
      done: 'success',
    };
    const labels: Record<string, string> = {
      received: 'Received',
      stones_accepted: 'Stones Accepted',
      sent_to_lab: 'Sent to Lab',
      verbal_uploaded: 'Verbal Uploaded',
      stones_returned: 'Stones Returned',
      certificates_scanned: 'Cert. Scanned',
      certificates_sent: 'Cert. Sent',
      done: 'Done',
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
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
                <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
                <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
                <SelectItem value="stones_returned">Stones Returned</SelectItem>
                <SelectItem value="certificates_scanned">Cert. Scanned</SelectItem>
                <SelectItem value="certificates_sent">Cert. Sent</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card className="border-navy-100">
        <CardHeader className="border-b border-navy-100">
          <CardTitle className="text-lg text-navy-800 flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            All Jobs ({filteredJobs.length})
          </CardTitle>
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
                      className="hover:bg-navy-50 cursor-pointer"
                      onClick={() => openJobDetails(job)}
                      data-testid={`job-row-${job.job_number}`}
                    >
                      <TableCell className="font-medium text-navy-800">#{job.job_number}</TableCell>
                      <TableCell className="text-navy-600">{job.client_name || 'N/A'}</TableCell>
                      <TableCell className="text-navy-600">{job.branch_name || 'N/A'}</TableCell>
                      <TableCell className="text-navy-600">{job.service_type}</TableCell>
                      <TableCell className="text-navy-600">{job.total_stones}</TableCell>
                      <TableCell className="text-navy-600 font-medium">
                        ${job.total_value.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-navy-600 font-medium">
                        ${job.total_fee.toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-navy-600">
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
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="stones_accepted">Stones Accepted</SelectItem>
                        <SelectItem value="sent_to_lab">Sent to Lab</SelectItem>
                        <SelectItem value="verbal_uploaded">Verbal Uploaded</SelectItem>
                        <SelectItem value="stones_returned">Stones Returned</SelectItem>
                        <SelectItem value="certificates_scanned">Cert. Scanned</SelectItem>
                        <SelectItem value="certificates_sent">Cert. Sent</SelectItem>
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
                  <Label className="text-navy-500">Total Fee</Label>
                  <p className="font-medium text-navy-800">${selectedJob.total_fee.toLocaleString()}</p>
                </div>
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
                  </Button>
                  
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

              {/* Lab Invoice Section - Admin Only */}
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

              {/* Stones Table with Certificate Grouping */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Gem className="h-4 w-4" />
                    Stones ({selectedJob.stones.length} total)
                  </Label>
                  <div className="flex items-center gap-2">
                    {editMode && (
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
                    {selectedStones.length >= 1 && areAllSelectedStonesGrouped() && (
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
                    {selectedStones.length >= 2 && !anySelectedStoneGrouped() && (
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
                            <TableCell>${stone.fee.toLocaleString()}</TableCell>
                            <TableCell className="text-navy-400">-</TableCell>
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
                                  <TableCell>${stone.fee.toLocaleString()}</TableCell>
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
            </DialogTitle>
            <DialogDescription>
              Job #{selectedJob?.job_number} | {viewingStone?.stone_type} | {viewingStone?.weight} ct
            </DialogDescription>
          </DialogHeader>

          {viewingStone && (
            <div className="space-y-6 py-4">
              {/* Stone Info */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
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
                  <Label className="text-navy-500 text-xs">Fee</Label>
                  <p className="font-medium text-navy-800">${viewingStone.fee.toLocaleString()}</p>
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
                  <div className="flex items-center gap-2">
                    {(() => {
                      const vf = viewingStone.verbal_findings;
                      const hasFindings = vf && typeof vf === 'object' && (vf as StructuredVerbalFindings).certificate_id;
                      if (hasFindings) {
                        return (
                          <>
                            <Badge variant="success">Completed</Badge>
                            {!verbalEditMode && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setVerbalEditMode(true)}
                                className="h-7 text-xs border-navy-300 hover:bg-navy-100"
                                data-testid="edit-verbal-button"
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            )}
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
                
                {/* Lock indicator when not in edit mode */}
                {!verbalEditMode && viewingStone.verbal_findings && typeof viewingStone.verbal_findings === 'object' && (viewingStone.verbal_findings as StructuredVerbalFindings).certificate_id && (
                  <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Form is locked. Click &quot;Edit&quot; to make changes.
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
                
                {verbalEditMode && (
                <Button
                  onClick={async () => {
                    if (!viewingStone) return;
                    if (!structuredFindings.certificate_id) {
                      alert('Certificate ID is required');
                      return;
                    }
                    setSavingStoneVerbal(true);
                    try {
                      await stonesApi.updateStructuredVerbal(viewingStone.id, structuredFindings);
                      // Update local state
                      setViewingStone({ ...viewingStone, verbal_findings: structuredFindings });
                      if (selectedJob) {
                        const updatedStones = selectedJob.stones?.map(s => 
                          s.id === viewingStone.id ? { ...s, verbal_findings: structuredFindings } : s
                        );
                        setSelectedJob({ ...selectedJob, stones: updatedStones });
                      }
                      // Also update the main jobs list
                      fetchData();
                      // Lock the form after saving
                      setVerbalEditMode(false);
                    } catch (error) {
                      console.error('Failed to save verbal findings:', error);
                      alert('Failed to save verbal findings');
                    } finally {
                      setSavingStoneVerbal(false);
                    }
                  }}
                  disabled={savingStoneVerbal || !structuredFindings.certificate_id}
                  className="bg-navy-800 hover:bg-navy-700 w-full"
                  data-testid="save-stone-verbal-button"
                >
                  {savingStoneVerbal ? (
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
    </div>
  );
}
