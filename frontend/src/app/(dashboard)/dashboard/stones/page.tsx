"use client";

import React, { useEffect, useState, useRef } from 'react';
import { stonesApi, settingsApi, cloudinaryApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
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
  Link2,
  Check,
  Pencil,
  Lock,
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
  position: number;
  certificate_group?: number;
  verbal_findings?: string | StructuredVerbalFindings;
  certificate_scan_url?: string;
  job_id: string;
  job_number: number;
  client_name?: string;
  branch_name?: string;
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
  const [actualFee, setActualFee] = useState<string>('');
  const [colorStabilityTest, setColorStabilityTest] = useState<boolean>(false);
  const [savingFees, setSavingFees] = useState(false);
  
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

  useEffect(() => {
    fetchStones();
  }, []);

  const fetchStones = async () => {
    try {
      const [stonesData, dropdownData] = await Promise.all([
        stonesApi.getAll(),
        settingsApi.getDropdowns().catch(() => ({ identification: [], color: [], origin: [], comment: [] })),
      ]);
      setStones(stonesData);
      setDropdownSettings(dropdownData);
      
      // Initialize dropdowns if empty
      if (!dropdownData.identification?.length) {
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
    
    // Initialize structured findings from stone data
    const vf = stone.verbal_findings;
    const findings = (vf && typeof vf === 'object') ? vf as StructuredVerbalFindings : null;
    setStructuredFindings({
      certificate_id: findings?.certificate_id || '',
      weight: findings?.weight || stone.weight,
      identification: findings?.identification || '',
      color: findings?.color || '',
      origin: findings?.origin || '',
      comment: findings?.comment || ''
    });
    
    // Initialize fee fields
    setActualFee(stone.actual_fee !== undefined ? String(stone.actual_fee) : '');
    setColorStabilityTest(stone.color_stability_test || false);
    
    // Always start in locked mode - user must click "Edit" to modify
    setVerbalEditMode(false);
    
    setDetailsOpen(true);
  };

  const handleSaveVerbalFindings = async () => {
    if (!selectedStone) return;
    if (!structuredFindings.certificate_id) {
      alert('Certificate ID is required');
      return;
    }
    
    setSavingVerbal(true);
    try {
      await stonesApi.updateStructuredVerbal(selectedStone.id, structuredFindings);
      // Update local state
      setStones(prev => prev.map(s => 
        s.id === selectedStone.id ? { ...s, verbal_findings: structuredFindings } : s
      ));
      setSelectedStone(prev => prev ? { ...prev, verbal_findings: structuredFindings } : null);
      // Lock the form after successful save
      setVerbalEditMode(false);
    } catch (error) {
      console.error('Failed to save verbal findings:', error);
      alert('Failed to save verbal findings');
    } finally {
      setSavingVerbal(false);
    }
  };

  const handleSaveFees = async () => {
    if (!selectedStone) return;
    
    // Check if there are actual changes to save
    const newActualFee = actualFee !== '' ? parseFloat(actualFee) : undefined;
    const hasActualFeeChange = newActualFee !== selectedStone.actual_fee;
    const hasColorStabilityChange = colorStabilityTest !== selectedStone.color_stability_test;
    
    if (!hasActualFeeChange && !hasColorStabilityChange) return;
    
    setSavingFees(true);
    try {
      const updateData: { actual_fee?: number; color_stability_test?: boolean } = {};
      
      // Only include actual_fee if it changed
      if (hasActualFeeChange && actualFee !== '') {
        updateData.actual_fee = parseFloat(actualFee);
      }
      
      // Only include color_stability_test if it's different from current
      if (hasColorStabilityChange) {
        updateData.color_stability_test = colorStabilityTest;
      }
      
      await stonesApi.updateFees(selectedStone.id, updateData);
      
      // Update local state
      setStones(prev => prev.map(s => 
        s.id === selectedStone.id 
          ? { 
              ...s, 
              actual_fee: updateData.actual_fee ?? s.actual_fee,
              color_stability_test: updateData.color_stability_test ?? s.color_stability_test,
              // Update fee if color stability changed
              fee: updateData.color_stability_test !== undefined && updateData.color_stability_test !== s.color_stability_test
                ? (updateData.color_stability_test ? s.fee + 50 : s.fee - 50)
                : s.fee
            } 
          : s
      ));
      setSelectedStone(prev => prev ? { 
        ...prev, 
        actual_fee: updateData.actual_fee ?? prev.actual_fee,
        color_stability_test: updateData.color_stability_test ?? prev.color_stability_test 
      } : null);
      
      // Silent save - no alert
    } catch (error) {
      console.error('Failed to save fees:', error);
    } finally {
      setSavingFees(false);
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
          <h1 className="text-2xl font-bold text-navy-800">Stones</h1>
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
          <div className="flex items-center gap-2 px-6 py-4 border-b border-navy-100">
            <Diamond className="h-5 w-5 text-navy-600" />
            <span className="font-semibold text-navy-800">All Stones ({filteredStones.length})</span>
          </div>
          
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
                  <TableCell className="font-mono text-sm font-medium">{stone.sku}</TableCell>
                  <TableCell>
                    <span className="text-navy-600">#{stone.job_number}</span>
                    {stone.client_name && (
                      <span className="text-navy-400 text-sm ml-2">({stone.client_name})</span>
                    )}
                  </TableCell>
                  <TableCell>{stone.stone_type}</TableCell>
                  <TableCell>{stone.weight} ct</TableCell>
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
                  <TableCell>
                    {stone.certificate_scan_url ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedStone(stone);
                          setViewCertOpen(true);
                        }}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        data-testid={`view-cert-${stone.sku}`}
                        title="View Certificate Scan"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-navy-300 text-sm">-</span>
                    )}
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
        </CardContent>
      </Card>

      {/* Stone Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
              <Diamond className="h-5 w-5" />
              Stone Details - {selectedStone?.sku}
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
              Job #{selectedStone?.job_number} | {selectedStone?.client_name}
            </DialogDescription>
          </DialogHeader>

          {selectedStone && (
            <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
              {/* Stone Info */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
                <div>
                  <Label className="text-navy-500 text-xs">Type</Label>
                  <p className="font-medium text-navy-800">{selectedStone.stone_type}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Weight</Label>
                  <p className="font-medium text-navy-800">{selectedStone.weight} ct</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Shape</Label>
                  <p className="font-medium text-navy-800">{selectedStone.shape}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Value</Label>
                  <p className="font-medium text-navy-800">${selectedStone.value.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Est. Fee</Label>
                  <p className="font-medium text-navy-800">${selectedStone.fee.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Actual Fee</Label>
                  {verbalEditMode ? (
                    <div className="flex items-center gap-1">
                      <span className="text-navy-600 text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={actualFee}
                        onChange={(e) => setActualFee(e.target.value)}
                        className="h-7 w-24 border-navy-200 text-sm font-medium"
                        data-testid="actual-fee-input"
                      />
                    </div>
                  ) : (
                    <p className={`font-medium ${selectedStone.actual_fee !== undefined && selectedStone.actual_fee !== selectedStone.fee ? 'text-green-700' : 'text-navy-800'}`}>
                      ${(selectedStone.actual_fee ?? selectedStone.fee).toLocaleString()}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Color Stability</Label>
                  {verbalEditMode ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Switch
                        checked={colorStabilityTest}
                        onCheckedChange={setColorStabilityTest}
                        className="scale-75"
                        data-testid="color-stability-switch"
                      />
                      <span className="text-xs text-navy-600">
                        {colorStabilityTest ? '+$50' : 'No'}
                      </span>
                    </div>
                  ) : (
                    <p className="font-medium text-navy-800">
                      {selectedStone.color_stability_test ? 'Yes (+$50)' : 'No'}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-navy-500 text-xs">Certificate Group</Label>
                  <p className="font-medium text-navy-800">
                    {selectedStone.certificate_group ? `Group ${selectedStone.certificate_group}` : '-'}
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
                      const vf = selectedStone.verbal_findings;
                      const hasFindings = vf && typeof vf === 'object' && (vf as StructuredVerbalFindings).certificate_id;
                      if (hasFindings) {
                        return (
                          <>
                            <Badge variant="success">Completed</Badge>
                            {isAdmin && !verbalEditMode && (
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
                    if (!selectedStone) return;
                    if (!structuredFindings.certificate_id) {
                      alert('Certificate ID is required');
                      return;
                    }
                    setSavingVerbal(true);
                    try {
                      // Save verbal findings
                      await stonesApi.updateStructuredVerbal(selectedStone.id, structuredFindings);
                      
                      // Save fee changes if any
                      const newActualFee = actualFee !== '' ? parseFloat(actualFee) : undefined;
                      const hasActualFeeChange = newActualFee !== selectedStone.actual_fee;
                      const hasColorStabilityChange = colorStabilityTest !== selectedStone.color_stability_test;
                      
                      if (hasActualFeeChange || hasColorStabilityChange) {
                        const feeUpdateData: { actual_fee?: number; color_stability_test?: boolean } = {};
                        if (hasActualFeeChange && newActualFee !== undefined) {
                          feeUpdateData.actual_fee = newActualFee;
                        }
                        if (hasColorStabilityChange) {
                          feeUpdateData.color_stability_test = colorStabilityTest;
                        }
                        await stonesApi.updateFees(selectedStone.id, feeUpdateData);
                      }
                      
                      // Update local state
                      const updatedStone = { 
                        ...selectedStone, 
                        verbal_findings: structuredFindings,
                        actual_fee: (hasActualFeeChange && newActualFee !== undefined) ? newActualFee : selectedStone.actual_fee,
                        color_stability_test: hasColorStabilityChange ? colorStabilityTest : selectedStone.color_stability_test
                      };
                      setStones(prev => prev.map(s => s.id === selectedStone.id ? updatedStone : s));
                      setSelectedStone(updatedStone);
                      // Lock the form after saving
                      setVerbalEditMode(false);
                    } catch (error) {
                      console.error('Failed to save:', error);
                      alert('Failed to save changes');
                    } finally {
                      setSavingVerbal(false);
                    }
                  }}
                  disabled={savingVerbal || !structuredFindings.certificate_id}
                  className="bg-navy-800 hover:bg-navy-700 w-full"
                  data-testid="save-stone-button"
                >
                  {savingVerbal ? (
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
                  <p className="text-sm text-amber-700 bg-amber-50 p-2 rounded">
                    This stone is part of Certificate Group {selectedStone.certificate_group}. 
                    Uploading a scan will apply to all stones in this group.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <input
                        ref={certInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleCertificateUpload}
                        className="hidden"
                        id="cert-upload"
                      />
                      <Button
                        variant="outline"
                        onClick={() => certInputRef.current?.click()}
                        disabled={uploadingCert}
                        data-testid="upload-cert-button"
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
                    </>
                  )}
                  
                  {selectedStone.certificate_scan_url && (
                    <Button
                      variant="outline"
                      onClick={() => setViewCertOpen(true)}
                      data-testid="view-cert-button"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Scan
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setDetailsOpen(false)} data-testid="close-stone-details">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Certificate Scan Dialog */}
      <Dialog open={viewCertOpen} onOpenChange={setViewCertOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh]">
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
    </div>
  );
}
