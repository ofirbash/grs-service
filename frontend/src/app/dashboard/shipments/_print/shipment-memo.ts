// Memo-style printable shipment document (matches Bashari job memo design).
import type { Shipment, Job, Stone } from '../_types';
import { openPrintWindow } from '@/lib/sanitize';

const COMPANY = {
  displayName: 'Bashari Lab-Direct',
  legalName: 'Eliyahu Bashari Diamonds LTD',
  address: 'Israel Diamond Exchange, Macabbi bld. 23-42, 1 Jabotinsky st. 5252001, Ramat-Gan',
  phones: ['+972-3-7521295', '+972-54-2989805'],
  email: 'grs-il@bashds.com',
  vat: '513180083',
  logoUrl:
    'https://customer-assets.emergentagent.com/job_777624e9-9d3b-43c3-b65b-05602d9f9f7d/artifacts/cpw6x0ub_bashari%20logo-square%20copy.jpg',
};

const SHIPMENT_TYPE_LABELS: Record<string, string> = {
  send_stones_to_lab: 'Send Stones to Lab',
  stones_from_lab: 'Stones from Lab',
  certificates_from_lab: 'Certificates from Lab',
};

/** Escape HTML to prevent XSS when injecting user-provided strings into the print doc. */
const esc = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatDate = (d: string | Date | undefined): string => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(d);
  }
};

interface PrintShipmentOptions {
  shipment: Shipment;
  jobs: Job[];
  /** Optional name -> full-address lookup. Used to expand the stored short
   * label (e.g. "Israel Office") into a full street address on the print. */
  addressBook?: Record<string, string>;
}

/**
 * Opens a new window with a polished memo-style Shipment document matching
 * the Bashari brand. Used for printing/signing off on a shipment.
 */
export function printShipmentMemo({ shipment, jobs, addressBook }: PrintShipmentOptions): void {
  const typeLabel = SHIPMENT_TYPE_LABELS[shipment.shipment_type] || shipment.shipment_type;

  /** Resolve a stored short address label (e.g. "Israel Office") to its full
   * postal address using the supplied lookup. Falls back to the raw value
   * if no entry is found, or if the value already looks like a full address. */
  const resolveAddress = (raw: string): string => {
    if (!raw) return '';
    const full = addressBook?.[raw];
    return full && full.trim() ? full : raw;
  };

  // Aggregate stones with parent job reference for a single unified table
  type StoneRow = {
    sku: string;
    stone_type: string;
    weight: number;
    shape: string;
    value: number;
    fee: number;
    job_number: number;
    cert_group?: number;
  };
  const allStones: StoneRow[] = [];
  jobs.forEach((j) => {
    (j.stones || []).forEach((s: Stone) =>
      allStones.push({
        sku: s.sku,
        stone_type: s.stone_type,
        weight: s.weight,
        shape: s.shape,
        value: s.value,
        fee: s.fee,
        job_number: j.job_number,
        cert_group: s.certificate_group,
      }),
    );
  });
  const totalValue = allStones.reduce((sum, s) => sum + (s.value || 0), 0);
  const totalWeight = allStones.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  const fmt = (n: number): string => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const stonesTableRows = allStones
    .map(
      (s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>#${s.job_number}</td>
        <td>${esc(s.sku)}</td>
        <td>${esc(s.stone_type)}</td>
        <td>${esc(String(s.weight))} ct</td>
        <td>${esc(s.shape)}</td>
        <td style="text-align:right;">$${fmt(s.value || 0)}</td>
      </tr>`,
    )
    .join('');

  const stonesTableHtml = allStones.length
    ? `<table>
        <thead>
          <tr>
            <th style="width:28px;">#</th>
            <th>Job</th>
            <th>SKU</th>
            <th>Type</th>
            <th>Weight</th>
            <th>Shape</th>
            <th style="text-align:right;">Value</th>
          </tr>
        </thead>
        <tbody>${stonesTableRows}</tbody>
        <tfoot>
          <tr class="totals-row">
            <td colspan="4" style="text-align:right;"><strong>Total — ${allStones.length} stone${allStones.length === 1 ? '' : 's'}</strong></td>
            <td><strong>${totalWeight.toFixed(2)} ct</strong></td>
            <td></td>
            <td style="text-align:right;"><strong>$${fmt(totalValue)}</strong></td>
          </tr>
        </tfoot>
      </table>`
    : '<p style="color:#71717a;font-size:12px;">No stones assigned to this shipment.</p>';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const absoluteLogo = COMPANY.logoUrl.startsWith('http')
    ? COMPANY.logoUrl
    : origin + COMPANY.logoUrl;

  // date_sent isn't in our Shipment type strictly; fall back to created_at
  const dateSent = formatDate((shipment as Shipment & { date_sent?: string }).date_sent || shipment.created_at);
  const printedAt = new Date().toLocaleString('en-GB', {
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
  <title>Shipment #${shipment.shipment_number} — ${COMPANY.displayName}</title>
  <style>
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 32px 40px; max-width: 960px; margin: 0 auto; color: #141417; line-height: 1.45; }
    .company-header { display: flex; justify-content: flex-start; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #141417; }
    .company-brand { display: flex; gap: 14px; align-items: center; }
    .company-brand img { width: 54px; height: 54px; object-fit: contain; border: 1px solid #e5e5e5; border-radius: 6px; padding: 2px; background: #ffffff; }
    .company-brand .name-block { display: flex; flex-direction: column; }
    .company-brand .display-name { font-size: 20px; font-weight: 700; color: #141417; }
    .company-brand .legal-name { font-size: 11px; color: #71717a; }
    .doc-title-bar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; }
    .doc-title-bar h1 { margin: 0; font-size: 22px; color: #141417; letter-spacing: 0.5px; }
    .doc-title-bar .shipment-number { font-size: 16px; font-weight: 600; color: #3f3f46; }
    .section { margin: 18px 0; }
    .section h3 { margin: 0 0 10px 0; color: #141417; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f5f5f5; border: 1px solid #e5e5e5; padding: 14px 16px; border-radius: 8px; }
    .field .label { font-weight: 600; color: #71717a; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .field .value { color: #141417; font-size: 13px; font-weight: 600; }
    .field .value.accent { color: #E30613; }
    .field-wide { grid-column: 1 / -1; }
    .field-wide .addr-value { font-weight: 500; line-height: 1.45; white-space: pre-wrap; }
    .route-card { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; background: #f5f5f5; border: 1px solid #e5e5e5; padding: 16px; border-radius: 8px; }
    .route-card .endpoint { padding: 8px 12px; background: #ffffff; border: 1px solid #e5e5e5; border-radius: 6px; }
    .route-card .endpoint .label { font-size: 10px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; }
    .route-card .endpoint .addr { font-weight: 600; font-size: 13px; color: #141417; margin-top: 2px; }
    .route-card .arrow { font-size: 22px; color: #141417; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; }
    .status-pending { background: #fef3c7; color: #78350f; }
    .status-in_transit { background: #141417; color: #ffffff; }
    .status-delivered { background: #d1fae5; color: #065f46; }
    .status-cancelled { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e5e5; padding: 7px 8px; text-align: left; font-size: 11px; }
    th { background: #ffffff; color: #141417; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; border-bottom: 2px solid #141417; }
    tr:nth-child(even):not(.totals-row) { background: #fafafa; }
    .totals-row td { background: #f5f5f5; border-top: 2px solid #141417; font-weight: 700; color: #141417; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #141417; color: #ffffff; padding: 16px; border-radius: 8px; margin-top: 14px; }
    .summary .summary-item { text-align: center; }
    .summary .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.7px; color: #a1a1aa; }
    .summary .summary-value { font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 4px; }
    .notes-box { padding: 12px 16px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 8px; color: #3f3f46; font-size: 11px; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin: 28px 0 12px; }
    .sig-block p { margin: 0 0 22px 0; color: #141417; font-size: 12px; font-weight: 600; }
    .sig-line { border-bottom: 1px solid #141417; height: 38px; }
    .sig-caption { margin-top: 4px; font-size: 10px; color: #a1a1aa; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e5e5; text-align: center; color: #71717a; font-size: 10px; line-height: 1.6; }
    .footer strong { color: #3f3f46; }
    @media print {
      body { padding: 18px 22px; }
      .page-break { page-break-before: always; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="company-header">
    <div class="company-brand">
      <img src="${absoluteLogo}" alt="${COMPANY.displayName}" onerror="this.style.display='none'" />
      <div class="name-block">
        <span class="display-name">${COMPANY.displayName}</span>
        <span class="legal-name">${COMPANY.legalName}</span>
      </div>
    </div>
  </div>

  <div class="doc-title-bar">
    <h1>Shipment Memo</h1>
    <div class="shipment-number">Shipment #${shipment.shipment_number} · ${dateSent}</div>
  </div>

  <div class="section">
    <h3>Shipment Details</h3>
    <div class="meta-grid">
      <div class="field">
        <div class="label">Type</div>
        <div class="value">${esc(typeLabel)}</div>
      </div>
      <div class="field">
        <div class="label">Courier</div>
        <div class="value">${esc(shipment.courier)}</div>
      </div>
      <div class="field" style="grid-column: span 2;">
        <div class="label">Tracking #</div>
        <div class="value">${esc(shipment.tracking_number || '—')}</div>
      </div>
      <div class="field field-wide">
        <div class="label">From</div>
        <div class="value addr-value">${esc(resolveAddress(shipment.source_address))}</div>
      </div>
      <div class="field field-wide">
        <div class="label">To</div>
        <div class="value addr-value">${esc(resolveAddress(shipment.destination_address))}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h3>Stones Manifest</h3>
    ${stonesTableHtml}
  </div>

  ${
    shipment.notes
      ? `<div class="section">
          <h3>Notes</h3>
          <div class="notes-box">${esc(shipment.notes)}</div>
        </div>`
      : ''
  }

  <div class="signatures">
    <div class="sig-block">
      <p>Sender</p>
      <div class="sig-line"></div>
      <div class="sig-caption">Name · Date</div>
    </div>
    <div class="sig-block">
      <p>Courier</p>
      <div class="sig-line"></div>
      <div class="sig-caption">Name · Date</div>
    </div>
    <div class="sig-block">
      <p>Receiver</p>
      <div class="sig-line"></div>
      <div class="sig-caption">Name · Date</div>
    </div>
  </div>

  <div class="footer">
    <div><strong>${COMPANY.legalName}</strong> · ${COMPANY.address}</div>
    <div>${COMPANY.phones.join(' · ')} · ${COMPANY.email} · VAT ${COMPANY.vat}</div>
    <div style="margin-top:4px;">Printed ${printedAt}</div>
  </div>

  <script>
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
}
