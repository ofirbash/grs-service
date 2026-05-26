"use client";

import React from 'react';
import {
  Eye,
  FileText,
  Gem,
  Link2,
  Loader2,
  Pencil,
  Printer,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { escapeHtml as esc } from '@/lib/sanitize';
import type { Job, Stone } from '../_types';

interface EditJobFormData {
  notes: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;

  // top-right actions
  onPrint: () => void;
  onOpenInNewTab: () => void;

  // edit mode
  editMode: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  editForm: EditJobFormData;
  setEditForm: React.Dispatch<React.SetStateAction<EditJobFormData>>;
  onSaveEdit: () => void;

  // memo upload
  memoInputRef: React.RefObject<HTMLInputElement>;
  uploadingMemo: boolean;
  onMemoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onViewMemo: () => void;

  // stones
  onOpenStone: (stone: Stone) => void;
}

const JOB_STATUSES: Array<[string, string]> = [
  ['draft', 'Draft'],
  ['stones_accepted', 'Stones Accepted'],
  ['sent_to_lab', 'Sent to Lab'],
  ['verbal_uploaded', 'Verbal Uploaded'],
  ['stones_returned', 'Stones Returned'],
  ['cert_uploaded', 'Cert. Uploaded'],
  ['cert_returned', 'Cert. Returned'],
  ['done', 'Done'],
];

/** Read-only-ish job detail dialog opened from the shipment view (and a few
 *  other places). Includes edit-status + edit-notes form, signed-memo upload,
 *  and a stones table with certificate grouping. Extracted from
 *  shipments/page.tsx — the jobs/page.tsx still has its own inline copy that
 *  we'll consolidate in a follow-up. */
export const JobDetailDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  job,
  onPrint,
  onOpenInNewTab,
  editMode,
  startEdit,
  cancelEdit,
  editForm,
  setEditForm,
  onSaveEdit,
  memoInputRef,
  uploadingMemo,
  onMemoChange,
  onViewMemo,
  onOpenStone,
}) => (
  <Dialog
    open={open}
    onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) cancelEdit();
    }}
  >
    <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="text-xl text-navy-800 flex items-center justify-between">
          <span>Job #{job?.job_number}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onPrint} data-testid="print-job-shipment-button">
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={startEdit} data-testid="edit-job-shipment-button">
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenInNewTab} data-testid="open-job-new-tab">
              <FileText className="h-4 w-4 mr-1" />
              Open in New Tab
            </Button>
          </div>
        </DialogTitle>
        <DialogDescription>
          {job?.client_name} | {job?.branch_name || 'N/A'}
        </DialogDescription>
      </DialogHeader>

      {job && (
        <div className="space-y-4 py-4">
          {/* Edit Mode */}
          {editMode ? (
            <div className="space-y-4 p-4 bg-navy-50 rounded-lg border-2 border-amber-400">
              <h3 className="font-semibold text-navy-800 flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit Job
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                    <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JOB_STATUSES.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="bg-white"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                  <Button onClick={onSaveEdit}>Save Changes</Button>
                </div>
              </div>
            </div>
          ) : (
            /* Job Info (View Mode) */
            <div className="grid grid-cols-3 gap-4 p-4 bg-navy-50 rounded-lg">
              <div>
                <Label className="text-navy-500 text-xs">Service Type</Label>
                <p className="font-medium text-navy-900">{job.service_type || 'N/A'}</p>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Status</Label>
                <Badge variant="secondary">{job.status.replace(/_/g, ' ')}</Badge>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Total Stones</Label>
                <p className="font-medium text-navy-900">{job.total_stones}</p>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Total Value</Label>
                <p className="font-medium text-navy-900">${job.total_value.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-navy-500 text-xs">Total Fee</Label>
                <p className="font-medium text-navy-900">${job.total_fee.toLocaleString()}</p>
              </div>
            </div>
          )}

          {job.notes && !editMode && (
            <div>
              <Label className="text-navy-500">Notes</Label>
              <p className="font-medium text-navy-900">{job.notes}</p>
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
                onChange={onMemoChange}
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
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{job.signed_memo_url ? 'Replace Memo' : 'Upload Memo'}</>
                )}
              </Button>

              {job.signed_memo_url && (
                <Button variant="outline" onClick={onViewMemo} data-testid="view-memo-shipment-button">
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
              Stones ({job.stones?.length || 0})
            </Label>
            {job.stones && job.stones.length > 0 ? (
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
                    {job.stones
                      .filter((s) => !s.certificate_group)
                      .map((stone) => (
                        <TableRow
                          key={stone.id}
                          className="cursor-pointer hover:bg-navy-100"
                          onClick={() => onOpenStone(stone)}
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
                      const groupedStones = job.stones.filter((s) => s.certificate_group);
                      const groups = new Map<number, typeof groupedStones>();
                      groupedStones.forEach((s) => {
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
                                onClick={() => onOpenStone(stone)}
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
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
