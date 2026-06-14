"use client";

import React, { useEffect, useState, useRef } from 'react';
import { stonesApi, settingsApi, cloudinaryApi } from '@/lib/api';
import { useAuthStore, useBranchFilterStore } from '@/lib/store';
import { filterOptionsForStone } from '@/lib/stoneDropdownFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Diamond,
  Search,
  FileText,
  Upload,
  Loader2,
  Eye,
  Check,
  Pencil,
  Lock,
  XCircle,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DoubleConfirmDialog } from '@/components/DoubleConfirmDialog';
import { StoneVerbalSection, seedStructuredFindings } from '@/components/StoneVerbalSection';
import { StoneEditDialog } from '@/components/dialogs/StoneEditDialog';
import { CompletenessBadges } from '@/components/jobs/CompletenessBadges';
import { isStoneVerbalComplete, isStoneCertComplete } from '@/lib/stoneCompleteness';

interface StructuredVerbalFindings {
  certificate_id?: string;
  weight?: number;
  identification?: string;
  color?: string;
  origin?: string;
  comment?: string;
  // Parcel-only: per-stone findings sharing the parent certificate_id.
  per_stone?: Array<{
    weight?: number;
    identification?: string;
    color?: string;
    origin?: string;
    comment?: string;
  }>;
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
  mounted?: boolean;
  position: number;
  certificate_group?: number;
  verbal_findings?: string | StructuredVerbalFindings;
  certificate_scan_url?: string;
  job_id: string;
  job_number: number;
  client_name?: string;
  branch_name?: string;
  cancelled?: boolean;
  // Parcel support: when kind === 'parcel', this row represents N
  // physical stones rolled up under one certificate (stone_count holds N).
  kind?: 'stone' | 'parcel';
  stone_count?: number;
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

export default function StonesPage() {
  const { user } = useAuthStore();
  const { selectedBranchId } = useBranchFilterStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'branch_admin';
  const [stones, setStones] = useState<Stone[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  
  // Stone details dialog
  const [selectedStone, setSelectedStone] = useState<Stone | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Verbal findings
  const [savingVerbal, setSavingVerbal] = useState(false);
  
  // Certificate scan upload
  const [uploadingCert, setUploadingCert] = useState(false);
  const certInputRef = useRef<HTMLInputElement>(null);
  
  // Fees management
  const [colorStabilityTest, setColorStabilityTest] = useState<boolean>(false);
  const [stoneMounted, setStoneMounted] = useState<boolean>(false);
  const [csFeeCost, setCsFeeCost] = useState(50);
  const [mountedFeeCost, setMountedFeeCost] = useState(50);
  
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
  const [verbalEditMode, setVerbalEditMode] = useState(false);
  
  // View certificate scan
  const [viewCertOpen, setViewCertOpen] = useState(false);

  // Delete-stone double-confirm dialog
  const [cancelTarget, setCancelTarget] = useState<Stone | null>(null);

  useEffect(() => {
    fetchStones();
  }, [selectedBranchId]);

  const fetchStones = async () => {
    try {
      const branchParam = selectedBranchId ? { branch_id: selectedBranchId } : {};
      // allSettled so one flaky endpoint doesn't blank the whole stones
      // page; session-expired (401/403) is handled by the global interceptor.
      const [stonesR, dropdownR, pricingR] = await Promise.allSettled([
        stonesApi.getAll(branchParam),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
        settingsApi.getPricing().catch(() => ({})),
      ]);
      if (stonesR.status === 'fulfilled') setStones(stonesR.value);
      else console.error('Failed to load stones', stonesR.reason);
      if (dropdownR.status === 'fulfilled') setDropdownSettings(dropdownR.value);
      if (pricingR.status === 'fulfilled') {
        const pricingData = pricingR.value;
        if (pricingData.color_stability_fee != null) setCsFeeCost(pricingData.color_stability_fee);
        if (pricingData.mounted_jewellery_fee != null) setMountedFeeCost(pricingData.mounted_jewellery_fee);
      }

      // Initialize dropdowns if empty
      if (dropdownR.status === 'fulfilled' && !dropdownR.value.identification?.length) {
        settingsApi.initializeDropdowns().then(() => {
          settingsApi.getDropdowns().then(setDropdownSettings);
        });
      }
    } catch (error) {
      console.error('Failed to fetch stones:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = (stone: Stone) => {
    setSelectedStone(stone);

    // Initialise structured findings via the shared seeder so parcels get
    // their N empty per_stone cards and singles get the legacy top-level
    // shape. Identical to what the jobs page does.
    setStructuredFindings(seedStructuredFindings(stone));

    // Initialize fee fields
    setColorStabilityTest(stone.color_stability_test || false);
    setStoneMounted(stone.mounted || false);

    // Always start in locked mode - user must click "Edit" to modify
    setVerbalEditMode(false);

    setDetailsOpen(true);
  };

  /** Save handler for the canonical StoneEditDialog. Lifted from the
   *  previously-inline closure on the Save button so the component can
   *  receive it as `onSave`. */
  const handleSaveStone = async () => {
    if (!selectedStone) return;
    setSavingVerbal(true);
    try {
      // Always persist verbal findings — wiping every field and saving
      // must commit the empty state instead of silently no-op'ing.
      await stonesApi.updateStructuredVerbal(selectedStone.id, structuredFindings);

      const hasColorStabilityChange = colorStabilityTest !== selectedStone.color_stability_test;
      const hasMountedChange = stoneMounted !== (selectedStone.mounted || false);
      if (hasColorStabilityChange || hasMountedChange) {
        const feeUpdateData: { color_stability_test?: boolean; mounted?: boolean } = {};
        if (hasColorStabilityChange) feeUpdateData.color_stability_test = colorStabilityTest;
        if (hasMountedChange) feeUpdateData.mounted = stoneMounted;
        await stonesApi.updateFees(selectedStone.id, feeUpdateData);
      }

      await fetchStones();
      const refreshedStones = await stonesApi.getAll(
        selectedBranchId ? { branch_id: selectedBranchId } : {},
      );
      const refreshedStone = refreshedStones.find((s: Stone) => s.id === selectedStone.id);
      if (refreshedStone) {
        setSelectedStone(refreshedStone);
        setColorStabilityTest(refreshedStone.color_stability_test || false);
        setStoneMounted(refreshedStone.mounted || false);
      }
      setVerbalEditMode(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes');
    } finally {
      setSavingVerbal(false);
    }
  };

  const handleCertificateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedStone) return;

    setUploadingCert(true);
    try {
      // Upload to Cloudinary
      const folder = `certificates/${selectedStone.job_id}`;
      const { url } = await cloudinaryApi.uploadFile(file, folder);
      
      // Check if stone is in a certificate group
      if (selectedStone.certificate_group) {
        // Upload for entire group - save URL to backend
        await stonesApi.uploadGroupCertificateScan(
          selectedStone.job_id,
          selectedStone.certificate_group,
          file.name,
          url
        );
        // Update all stones in the group locally
        setStones(prev => prev.map(s => 
          s.job_id === selectedStone.job_id && s.certificate_group === selectedStone.certificate_group
            ? { ...s, certificate_scan_url: url }
            : s
        ));
      } else {
        // Upload for single stone - save URL to backend
        await stonesApi.uploadCertificateScan(selectedStone.id, file.name, url);
        // Update local state
        setStones(prev => prev.map(s => 
          s.id === selectedStone.id ? { ...s, certificate_scan_url: url } : s
        ));
      }
      
      setSelectedStone(prev => prev ? { ...prev, certificate_scan_url: url } : null);
    } catch (error) {
      console.error('Failed to upload certificate scan:', error);
      alert('Failed to upload certificate scan');
    } finally {
      setUploadingCert(false);
    }
    
    // Reset input
    if (certInputRef.current) {
      certInputRef.current.value = '';
    }
  };

  // Filter stones
  const filteredStones = stones.filter(stone => {
    const matchesSearch = 
      stone.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stone.stone_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stone.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `#${stone.job_number}`.includes(searchQuery);
    
    const matchesFilter = 
      filterType === 'all' ||
      (filterType === 'with_verbal' && stone.verbal_findings) ||
      (filterType === 'without_verbal' && !stone.verbal_findings) ||
      (filterType === 'with_cert' && stone.certificate_scan_url) ||
      (filterType === 'without_cert' && !stone.certificate_scan_url) ||
      (filterType === 'grouped' && stone.certificate_group) ||
      (filterType === 'ungrouped' && !stone.certificate_group);
    
    return matchesSearch && matchesFilter;
  });

  const getStatusIndicators = (stone: Stone) => {
    const indicators = [];
    if (stone.verbal_findings) {
      indicators.push(<Badge key="verbal" variant="success" className="text-xs">Verbal</Badge>);
    }
    if (stone.certificate_scan_url) {
      indicators.push(<Badge key="cert" variant="default" className="text-xs">Cert Scan</Badge>);
    }
    if (stone.certificate_group) {
      indicators.push(<Badge key="group" variant="outline" className="text-xs">Cert {stone.certificate_group}</Badge>);
    }
    return indicators;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-navy-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Stones</h1>
          <p className="text-navy-500">Manage all stones across jobs</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
              <Input
                placeholder="Search by SKU, type, client, or job #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-navy-200"
                data-testid="stones-search-input"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-48 border-navy-200" data-testid="stones-filter">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stones</SelectItem>
                <SelectItem value="with_verbal">With Verbal</SelectItem>
                <SelectItem value="without_verbal">Without Verbal</SelectItem>
                <SelectItem value="with_cert">With Cert Scan</SelectItem>
                <SelectItem value="without_cert">Without Cert Scan</SelectItem>
                <SelectItem value="grouped">In Certificate Group</SelectItem>
                <SelectItem value="ungrouped">Not Grouped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Stones Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-navy-200">
            <Diamond className="h-5 w-5 text-navy-600" />
            <span className="font-semibold text-navy-900">All Stones ({filteredStones.length})</span>
          </div>
          
          {/* Mobile Card View */}
          <div className="md:hidden space-y-2 p-3">
            {filteredStones.length === 0 ? (
              <div className="p-6 text-center text-navy-500">No stones found</div>
            ) : (
              filteredStones.map((stone) => (
                <div
                  key={stone.id}
                  className="border border-navy-200 rounded-lg p-3 hover:bg-navy-50 cursor-pointer active:bg-navy-100"
                  onClick={() => handleOpenDetails(stone)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-semibold text-navy-900">{stone.sku}</span>
                    <span className="text-xs text-navy-500">Job #{stone.job_number}</span>
                  </div>
                  <div className="text-sm text-navy-600">{stone.stone_type} &middot; {stone.weight} ct</div>
                  <div className="flex items-center justify-between mt-1 text-xs text-navy-500">
                    <span>{stone.client_name}</span>
                    <span className="font-medium text-navy-900">${stone.fee?.toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-navy-50">
                <TableHead className="text-navy-700">SKU</TableHead>
                <TableHead className="text-navy-700">Job</TableHead>
                <TableHead className="text-navy-700">Type</TableHead>
                <TableHead className="text-navy-700">Weight</TableHead>
                <TableHead className="text-navy-700">Shape</TableHead>
                <TableHead className="text-navy-700">Value</TableHead>
                <TableHead className="text-navy-700">Status</TableHead>
                <TableHead className="text-navy-700 w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStones.map((stone) => (
                <TableRow 
                  key={stone.id}
                  className="cursor-pointer hover:bg-navy-50"
                  onClick={() => handleOpenDetails(stone)}
                  data-testid={`stone-row-${stone.sku}`}
                >
                  <TableCell className="font-mono text-sm font-medium">
                    <span className="inline-flex items-center">
                      {stone.sku}
                      <CompletenessBadges
                        verbalComplete={isStoneVerbalComplete(stone)}
                        certComplete={isStoneCertComplete(stone)}
                        size="xs"
                        testIdSuffix={`stone-${stone.sku}`}
                      />
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-navy-600">#{stone.job_number}</span>
                    {stone.client_name && (
                      <span className="text-navy-400 text-sm ml-2">({stone.client_name})</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{stone.stone_type}</span>
                      {stone.kind === 'parcel' && (
                        <span
                          className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border font-medium bg-amber-100 text-amber-900 border-amber-300"
                          data-testid={`stone-list-parcel-badge-${stone.sku}`}
                        >
                          Parcel of {stone.stone_count || 0}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {stone.weight} ct
                    {stone.kind === 'parcel' && <span className="text-[10px] text-navy-400 ml-1">(total)</span>}
                  </TableCell>
                  <TableCell>{stone.shape}</TableCell>
                  <TableCell>${stone.value.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {getStatusIndicators(stone)}
                      {getStatusIndicators(stone).length === 0 && (
                        <span className="text-navy-400 text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {stone.certificate_scan_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedStone(stone);
                            setViewCertOpen(true);
                          }}
                          className="text-navy-600 hover:text-navy-900 hover:bg-green-50"
                          data-testid={`view-cert-${stone.sku}`}
                          title="View Certificate Scan"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCancelTarget(stone)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          data-testid={`delete-stone-${stone.sku}`}
                          title="Delete stone"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredStones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-navy-400">
                    No stones found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* Stone Details Dialog */}
      <StoneEditDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        stone={selectedStone}
        // The Stones page doesn't load the full Job — but the canonical
        // dialog only reads job_number + service_type + recheck_reasons,
        // all of which are optional. Pass a shallow object built from
        // whatever the Stone row already carries.
        job={selectedStone ? { job_number: selectedStone.job_number, client_name: selectedStone.client_name } : null}
        isAdmin={isAdmin}
        findings={structuredFindings}
        setFindings={setStructuredFindings}
        dropdownSettings={dropdownSettings}
        editMode={verbalEditMode}
        setEditMode={setVerbalEditMode}
        colorStability={colorStabilityTest}
        setColorStability={setColorStabilityTest}
        mounted={stoneMounted}
        setMounted={setStoneMounted}
        csFeeCost={csFeeCost}
        mountedFeeCost={mountedFeeCost}
        saving={savingVerbal}
        onSave={handleSaveStone}
        certInputRef={certInputRef}
        uploadingCert={uploadingCert}
        onCertChange={handleCertificateUpload}
        onViewCert={() => setViewCertOpen(true)}
      />


      {/* View Certificate Scan Dialog */}
      <Dialog open={viewCertOpen} onOpenChange={setViewCertOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh]">
          <DialogHeader>
            <DialogTitle>Certificate Scan - {selectedStone?.sku}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center bg-gray-100 rounded-lg" style={{ minHeight: '500px', maxHeight: '75vh' }}>
            {selectedStone?.certificate_scan_url && (
              selectedStone.certificate_scan_url.startsWith('data:application/pdf') || 
              selectedStone.certificate_scan_url.toLowerCase().endsWith('.pdf') ? (
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

      {/* Delete-stone double-confirm */}
      <DoubleConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => { if (!o) setCancelTarget(null); }}
        title={`Delete stone ${cancelTarget?.sku || ''}?`}
        description={
          <>
            This stone will be <strong>permanently removed</strong> from its job.
            Its value, fee and count will no longer contribute to the job&apos;s
            totals. This action cannot be undone.
          </>
        }
        confirmLabel="Delete Stone"
        testIdPrefix="delete-stone"
        onConfirm={async () => {
          if (!cancelTarget) return;
          await stonesApi.cancel(cancelTarget.id);
          await fetchStones();
        }}
      />
    </div>
  );
}
