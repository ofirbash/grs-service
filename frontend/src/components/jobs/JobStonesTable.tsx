"use client";

/**
 * <JobStonesTable> — canonical stones table used inside the Job Detail
 * dialog on BOTH the /dashboard/jobs page and the /dashboard/shipments
 * page. Extracted Feb 25 2026 because cert-grouping bug fixes were
 * landing in only one of the two duplicate inline copies (the parcel-
 * display regression that prompted this consolidation work).
 *
 * Two variants:
 *   - 'compact' (shipments view): SKU/Customer SKU/Type/Weight/Value/Certificate.
 *     Read-only — clicking a row opens the stone detail dialog.
 *   - 'full'    (jobs view):      Adds selection checkboxes (multi-select for
 *     batch group/ungroup), per-stone fee, status badges, certificate-scan
 *     view button, optional delete (edit mode + admin only).
 *
 * Cert-grouping logic (sorted, header row with totals, indented rows
 * tagged with the cert number) is the same across both — that's the
 * piece that kept drifting before consolidation.
 */

import React from 'react';
import { FileText, Link2, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { escapeHtml as esc } from '@/lib/sanitize';
import { StoneStatusBadges } from '@/app/dashboard/jobs/_components/StoneStatusBadges';

/** Human label for a certificate group based on how many stones it
 *  contains. Inlined here (rather than imported from a route-private
 *  `_helpers.ts`) so this shared component doesn't reach into any one
 *  page's internals. */
function getCertificateLabel(stoneCount: number): string {
  if (stoneCount === 1) return 'Single';
  if (stoneCount === 2) return 'Pair';
  if (stoneCount >= 3 && stoneCount <= 6) return 'Layout';
  if (stoneCount > 6) return 'Multi-Stone';
  return 'Group';
}

/** Structural Stone — the minimum the table needs to render. Both
 *  /jobs and /shipments `Stone` types satisfy this. */
export interface StonesTableStone {
  id: string;
  sku: string;
  customer_sku?: string | null;
  stone_type: string;
  weight: number;
  shape: string;
  value: number;
  fee?: number;
  certificate_group?: number;
  certificate_scan_url?: string;
  cancelled?: boolean;
  stone_status?: 'at_office' | 'at_lab' | 'returned';
  cert_status?: 'pending' | 'delivered';
  kind?: 'stone' | 'parcel';
  stone_count?: number;
}

type Variant = 'compact' | 'full';

interface Props {
  stones: StonesTableStone[];
  variant: Variant;
  onOpenStone: (stone: StonesTableStone) => void;
  /** Empty-state message; defaults to "No stones in this job". */
  emptyMessage?: string;

  // --- 'full' variant only (ignored in compact) ---
  /** Selection set for multi-select / batch actions. */
  selectedStones?: string[];
  onToggleStone?: (stoneId: string) => void;
  /** Click the inline `FileText` icon on a row to preview the cert scan. */
  onViewCertScan?: (stone: StonesTableStone) => void;
  /** Edit-mode only: trash icon to remove a stone from the job. */
  onDeleteStone?: (stoneId: string, sku: string) => void;
  editMode?: boolean;
  isAdmin?: boolean;
}

export const JobStonesTable: React.FC<Props> = ({
  stones,
  variant,
  onOpenStone,
  emptyMessage = 'No stones in this job',
  selectedStones,
  onToggleStone,
  onViewCertScan,
  onDeleteStone,
  editMode,
  isAdmin,
}) => {
  const isFull = variant === 'full';
  const showDelete = isFull && editMode && isAdmin && !!onDeleteStone;
  const showSelect = isFull && !!onToggleStone;

  if (!stones || stones.length === 0) {
    return <p className="text-navy-400 text-center py-4">{emptyMessage}</p>;
  }

  // Bucket: ungrouped first (in input order), then grouped — by cert number ascending.
  const ungrouped = stones.filter((s) => !s.certificate_group);
  const grouped = stones.filter((s) => s.certificate_group);
  const groups = new Map<number, StonesTableStone[]>();
  grouped.forEach((s) => {
    const g = s.certificate_group as number;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  });

  // Column count drives the cert-group header `colSpan`. Keep in sync with
  // the THs below: SKU, Customer SKU, Type, Weight, Value [+ Fee in full],
  // Certificate [+ select in full] [+ delete if showDelete].
  let colCount = 6; // SKU, Customer SKU, Type, Weight, Value, Certificate
  if (isFull) colCount += 1; // Fee
  if (showSelect) colCount += 1;
  if (showDelete) colCount += 1;

  const renderRow = (stone: StonesTableStone, opts: { inGroup: boolean; groupNum?: number }) => {
    const selected = selectedStones?.includes(stone.id) ?? false;
    return (
      <TableRow
        key={stone.id}
        className={
          'cursor-pointer hover:bg-navy-100 ' +
          (opts.inGroup ? 'bg-navy-50/50 ' : '') +
          (selected ? 'bg-navy-100' : '')
        }
        onClick={() => onOpenStone(stone)}
        data-testid={`job-stone-row-${esc(stone.sku)}`}
      >
        {showSelect && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleStone?.(stone.id)}
              className="h-4 w-4 rounded border-navy-300"
              data-testid={`select-stone-${stone.id}`}
            />
          </TableCell>
        )}
        <TableCell className="font-mono text-sm">
          {stone.sku}
          {isFull && (
            <StoneStatusBadges
              // StoneStatusBadges typing requires the full /jobs Stone shape,
              // but it only reads `stone_status`, `cert_status`, `cancelled`
              // — all present on `StonesTableStone`. The cast is a structural
              // hand-wave to bridge the two type universes (jobs vs shipments).
              stone={stone as unknown as Parameters<typeof StoneStatusBadges>[0]['stone']}
            />
          )}
        </TableCell>
        <TableCell className="font-mono text-sm text-navy-600 truncate" data-testid={`job-stone-customer-sku-${stone.id}`}>
          {stone.customer_sku || <span className="text-navy-300">—</span>}
        </TableCell>
        <TableCell>{stone.stone_type}</TableCell>
        <TableCell>{stone.weight} ct</TableCell>
        <TableCell>${stone.value.toLocaleString()}</TableCell>
        {isFull && (
          <TableCell>
            <span>${(stone.fee ?? 0).toLocaleString()}</span>
          </TableCell>
        )}
        <TableCell onClick={(e) => e.stopPropagation()}>
          {opts.inGroup ? (
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="bg-navy-100">
                Cert {opts.groupNum}
              </Badge>
              {isFull && stone.certificate_scan_url && onViewCertScan && (
                <button
                  onClick={() => onViewCertScan(stone)}
                  className="text-navy-600 hover:text-navy-900 p-1 rounded hover:bg-navy-50"
                  title="View Certificate Scan"
                  data-testid={`view-cert-${stone.id}`}
                >
                  <FileText className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : isFull && stone.certificate_scan_url && onViewCertScan ? (
            <button
              onClick={() => onViewCertScan(stone)}
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
        {showDelete && (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onDeleteStone?.(stone.id, stone.sku)}
                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                title="Remove stone from job"
                data-testid={`delete-stone-${stone.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </TableCell>
        )}
      </TableRow>
    );
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table className={isFull ? 'table-fixed w-full' : undefined}>
        <TableHeader>
          <TableRow className="bg-navy-50">
            {showSelect && <TableHead className="w-10" />}
            <TableHead className="text-navy-700">SKU</TableHead>
            <TableHead className="text-navy-700">Customer SKU</TableHead>
            <TableHead className="text-navy-700">Type</TableHead>
            <TableHead className="text-navy-700">Weight</TableHead>
            <TableHead className="text-navy-700">Value</TableHead>
            {isFull && <TableHead className="text-navy-700">Fee</TableHead>}
            <TableHead className={isFull ? 'text-navy-700 w-24' : 'text-navy-700'}>
              Certificate
            </TableHead>
            {showDelete && <TableHead className="text-navy-700 w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ungrouped.map((stone) => renderRow(stone, { inGroup: false }))}

          {Array.from(groups.entries())
            .sort(([a], [b]) => a - b)
            .map(([groupNum, groupStones]) => (
              <React.Fragment key={groupNum}>
                <TableRow className="bg-navy-800 hover:bg-navy-800">
                  <TableCell colSpan={colCount} className="py-2">
                    <div className="flex items-center justify-between text-white">
                      <span className="font-medium flex items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        Certificate {groupNum}
                        {isFull && (
                          <> - {getCertificateLabel(groupStones.length)} </>
                        )}
                        ({groupStones.length} stone{groupStones.length > 1 ? 's' : ''})
                      </span>
                      <span className="text-sm opacity-80">
                        Total: ${groupStones.reduce((sum, s) => sum + s.value, 0).toLocaleString()}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
                {groupStones.map((stone) =>
                  renderRow(stone, { inGroup: true, groupNum }),
                )}
              </React.Fragment>
            ))}
        </TableBody>
      </Table>
    </div>
  );
};
