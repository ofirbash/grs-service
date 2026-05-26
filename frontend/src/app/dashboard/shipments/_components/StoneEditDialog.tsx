"use client";

import React from 'react';
import {
  Check,
  Diamond,
  Eye,
  FileText,
  Link2,
  Loader2,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type {
  DropdownSettings,
  Job,
  Stone,
  StructuredVerbalFindings,
} from '../_types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stone: Stone | null;
  job: Job | null;
  dropdownSettings: DropdownSettings;

  // structured verbal findings
  findings: StructuredVerbalFindings;
  setFindings: React.Dispatch<React.SetStateAction<StructuredVerbalFindings>>;
  savingVerbal: boolean;
  onSaveVerbal: () => void;

  // cert scan upload
  certInputRef: React.RefObject<HTMLInputElement>;
  uploadingCert: boolean;
  onCertChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewCert: () => void;
}

/** Per-stone editor opened from the JobDetailDialog. Surfaces verbal findings
 *  (certificate id, weight, identification, color, origin, comment — all
 *  searchable selects pulling from settings) and a certificate-scan upload.
 *  Extracted from shipments/page.tsx — same notes as JobDetailDialog about
 *  the jobs/page.tsx inline copy that's still pending consolidation. */
export const StoneEditDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  stone,
  job,
  dropdownSettings,
  findings,
  setFindings,
  savingVerbal,
  onSaveVerbal,
  certInputRef,
  uploadingCert,
  onCertChange,
  onViewCert,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-800 flex items-center gap-2">
          <Diamond className="h-5 w-5" />
          Stone - {stone?.sku}
        </DialogTitle>
        <DialogDescription>
          Job #{job?.job_number} | {stone?.stone_type} | {stone?.weight} ct
        </DialogDescription>
      </DialogHeader>

      {stone && (
        <div className="space-y-4 py-4">
          {/* Stone Info */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
            <div>
              <Label className="text-navy-500 text-xs">Type</Label>
              <p className="font-medium text-navy-900">{stone.stone_type}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Weight</Label>
              <p className="font-medium text-navy-900">{stone.weight} ct</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Shape</Label>
              <p className="font-medium text-navy-900">{stone.shape}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Value</Label>
              <p className="font-medium text-navy-900">${stone.value.toLocaleString()}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Fee</Label>
              <p className="font-medium text-navy-900">${stone.fee.toLocaleString()}</p>
            </div>
            <div>
              <Label className="text-navy-500 text-xs">Certificate Group</Label>
              <p className="font-medium text-navy-900">
                {stone.certificate_group ? `Group ${stone.certificate_group}` : '-'}
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
              {typeof stone.verbal_findings === 'object' && stone.verbal_findings?.certificate_id && (
                <Badge variant="success">Completed</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm text-navy-600">Certificate ID</Label>
                <Input
                  placeholder="Enter certificate ID..."
                  value={findings.certificate_id || ''}
                  onChange={(e) => setFindings((prev) => ({ ...prev, certificate_id: e.target.value }))}
                  className="border-navy-200"
                  data-testid="verbal-certificate-id"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-navy-600">Weight (ct)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Weight..."
                  value={findings.weight || ''}
                  onChange={(e) => setFindings((prev) => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                  className="border-navy-200"
                  data-testid="verbal-weight"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-navy-600">Identification</Label>
                <SearchableSelect
                  value={findings.identification || ''}
                  onValueChange={(value) => setFindings((prev) => ({ ...prev, identification: value }))}
                  options={dropdownSettings.identification.map((opt) => ({ value: opt.value }))}
                  placeholder="Select identification..."
                  searchPlaceholder="Search identification..."
                  data-testid="verbal-identification"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-navy-600">Color</Label>
                <SearchableSelect
                  value={findings.color || ''}
                  onValueChange={(value) => setFindings((prev) => ({ ...prev, color: value }))}
                  options={dropdownSettings.color.map((opt) => ({ value: opt.value }))}
                  placeholder="Select color..."
                  searchPlaceholder="Search color..."
                  data-testid="verbal-color"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-navy-600">Origin</Label>
                <SearchableSelect
                  value={findings.origin || ''}
                  onValueChange={(value) => setFindings((prev) => ({ ...prev, origin: value }))}
                  options={dropdownSettings.origin.map((opt) => ({ value: opt.value }))}
                  placeholder="Select origin..."
                  searchPlaceholder="Search origin..."
                  data-testid="verbal-origin"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-navy-600">Comment</Label>
                <SearchableSelect
                  value={findings.comment || ''}
                  onValueChange={(value) => setFindings((prev) => ({ ...prev, comment: value }))}
                  options={dropdownSettings.comment.map((opt) => ({ value: opt.value }))}
                  placeholder="Select comment..."
                  searchPlaceholder="Search comment..."
                  data-testid="verbal-comment"
                />
              </div>
            </div>

            <Button
              onClick={onSaveVerbal}
              disabled={savingVerbal}
              className="bg-navy-900 hover:bg-navy-800 w-full"
              data-testid="save-stone-verbal-button"
            >
              {savingVerbal ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : (
                <><Check className="h-4 w-4 mr-2" />Save Verbal Findings</>
              )}
            </Button>
          </div>

          {/* Certificate Scan */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Certificate Scan
                {stone.certificate_group && (
                  <Badge variant="outline" className="ml-2">
                    <Link2 className="h-3 w-3 mr-1" />
                    Group {stone.certificate_group}
                  </Badge>
                )}
              </Label>
              {stone.certificate_scan_url && <Badge variant="success">Uploaded</Badge>}
            </div>

            {stone.certificate_group && (
              <p className="text-sm text-navy-600 bg-amber-50 p-2 rounded">
                This stone is part of Certificate Group {stone.certificate_group}.
                Uploading a scan will apply to all stones in this group.
              </p>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={certInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={onCertChange}
                className="hidden"
                id="cert-upload-shipment"
              />
              <Button variant="outline" onClick={() => certInputRef.current?.click()} disabled={uploadingCert}>
                {uploadingCert ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{stone.certificate_scan_url ? 'Replace Scan' : 'Upload Scan'}</>
                )}
              </Button>

              {stone.certificate_scan_url && (
                <Button variant="outline" onClick={onViewCert}>
                  <Eye className="h-4 w-4 mr-2" />
                  View Scan
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
