/**
 * Pure-function builder for the printable Job memo / intake receipt / completion memo.
 *
 * Extracted from `jobs/page.tsx` as part of the P3 refactor. Has zero React
 * dependencies — given a job + the related client/branch + COMPANY_INFO and the
 * current window origin, it returns the full HTML document string.
 *
 * Status drives the document title:
 *   - draft / pending_stones  → "Intake Receipt / Memo"
 *   - cert_issued / done      → "Completion Memo"
 *   - everything else         → "Job Memo"
 *
 * Cancelled stones are excluded from the rendered table AND from the table-
 * footer totals. The discount footer line is only rendered when discount > 0.
 */
import { escapeHtml as esc } from "@/lib/sanitize";
import { COMPANY_INFO } from "../_helpers";
import type { Job, Stone, Client, Branch } from "../_types";

interface BuildJobMemoArgs {
  job: Job;
  client: Client | undefined;
  branch: Branch | undefined;
  origin: string;
}

const fmt = (n: number): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelKey = (count: number): string => {
  if (count === 1) return "single";
  if (count === 2) return "pair";
  if (count >= 3 && count <= 6) return "layout";
  return "multi-stone";
};

const stoneRow = (
  index: number,
  stone: Stone,
  isGrouped: boolean,
): string => {
  const flags: string[] = [];
  if (stone.color_stability_test) flags.push("CS");
  if (stone.mounted) flags.push("Mtd");
  const flagsStr = flags.length > 0 ? flags.join(", ") : "—";
  return `
    <tr class="${isGrouped ? "grouped-row" : ""}">
      <td>${index}</td>
      <td>${esc(stone.sku)}</td>
      <td>${esc(stone.stone_type)}</td>
      <td>${esc(String(stone.weight))} ct</td>
      <td>${esc(stone.shape)}</td>
      <td class="flags">${flagsStr}</td>
      <td>$${fmt(stone.value || 0)}</td>
      <td>$${fmt(stone.fee || 0)}</td>
    </tr>
  `;
};

export function buildJobMemoHtml({
  job,
  client,
  branch,
  origin,
}: BuildJobMemoArgs): string {
  // Zero-pad job number to 5 digits for memo display (e.g. 500 → "00500").
  const paddedJobNumber = String(job.job_number).padStart(5, "0");

  // Status-driven doc title. Job number is appended so it's the most
  // prominent element on the page.
  const docTitleBase =
    job.status === "draft" || job.status === "pending_stones"
      ? "Intake Receipt / Memo"
      : job.status === "cert_issued" || job.status === "done"
      ? "Completion Memo"
      : "Job Memo";
  const docTitle = `${docTitleBase} #${paddedJobNumber}`;

  // Cancelled stones never appear on the printed memo or in its totals.
  const activeStones = job.stones.filter((s) => !s.cancelled);

  const ungroupedStones = activeStones.filter((s) => !s.certificate_group);
  const groupedStonesMap = new Map<number, Stone[]>();
  activeStones
    .filter((s) => s.certificate_group)
    .forEach((s) => {
      const group = s.certificate_group!;
      if (!groupedStonesMap.has(group)) groupedStonesMap.set(group, []);
      groupedStonesMap.get(group)!.push(s);
    });

  // Human-friendly group labels (pair-1, layout-1, multi-stone-1, etc).
  const sortedGroups = Array.from(groupedStonesMap.entries()).sort(
    ([a], [b]) => a - b,
  );
  const groupLabels = new Map<number, string>();
  const typeCounters: Record<string, number> = {};
  sortedGroups.forEach(([groupNum, stones]) => {
    const key = labelKey(stones.length);
    typeCounters[key] = (typeCounters[key] || 0) + 1;
    groupLabels.set(groupNum, `${key}-${typeCounters[key]}`);
  });

  // Total certificates = number of groups + each ungrouped stone (one cert each).
  const totalCertificates = groupedStonesMap.size + ungroupedStones.length;

  let rowIndex = 1;
  const ungroupedRows = ungroupedStones
    .map((stone) => stoneRow(rowIndex++, stone, false))
    .join("");

  const groupedRows = sortedGroups
    .map(([groupNum, stones]) => {
      const label = groupLabels.get(groupNum) || "group";
      const groupHeader = `
        <tr class="group-separator">
          <td colspan="8">
            <strong>${label}</strong> (${stones.length} stone${stones.length > 1 ? "s" : ""})
          </td>
        </tr>
      `;
      const stoneRows = stones
        .map((stone) => stoneRow(rowIndex++, stone, true))
        .join("");
      return groupHeader + stoneRows;
    })
    .join("");

  const subtotal = (job.total_fee || 0) + (job.discount || 0);
  const hasDiscount = (job.discount || 0) > 0;

  // Footer totals (active stones only — cancelled excluded above).
  const totalWeight = activeStones.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  const totalValueAll = activeStones.reduce((sum, s) => sum + (s.value || 0), 0);
  const totalFeeAll = activeStones.reduce((sum, s) => sum + (s.fee || 0), 0);
  const totalStonesCount = activeStones.length;

  const absoluteLogo = COMPANY_INFO.logoUrl.startsWith("http")
    ? COMPANY_INFO.logoUrl
    : origin + COMPANY_INFO.logoUrl;

  const formattedDate = new Date(job.created_at).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const formattedPrintedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isIsraelBranch = (branch?.name || job.branch_name || "")
    .toLowerCase()
    .includes("israel");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Job #${job.job_number} — ${COMPANY_INFO.displayName}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 22px 32px; max-width: 900px; margin: 0 auto; color: #141417; line-height: 1.4; }
        .company-header { display: flex; justify-content: flex-start; align-items: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #141417; }
        .company-brand { display: flex; gap: 12px; align-items: center; }
        .company-brand img { width: 44px; height: 44px; object-fit: contain; border: 1px solid #e5e5e5; border-radius: 6px; padding: 2px; background: #ffffff; }
        .company-brand .name-block { display: flex; flex-direction: column; }
        .company-brand .display-name { font-size: 18px; font-weight: 700; color: #141417; }
        .company-brand .legal-name { font-size: 10px; color: #71717a; }
        .doc-title-bar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
        .doc-title-bar h1 { margin: 0; font-size: 18px; color: #141417; letter-spacing: 0.5px; }
        .doc-title-bar .job-number { font-size: 13px; font-weight: 600; color: #3f3f46; }
        .job-meta-row { display: flex; flex-wrap: wrap; gap: 18px; padding: 10px 14px; background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 6px; margin-bottom: 14px; }
        .job-meta-row .cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .job-meta-row .cell.flex1 { flex: 1; }
        .job-meta-row .meta-label { font-size: 9px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 0.6px; }
        .job-meta-row .meta-value { font-size: 12px; font-weight: 600; color: #141417; line-height: 1.4; }
        .job-meta-row .meta-value .sub { font-weight: 400; color: #3f3f46; font-size: 11px; }
        .section { margin: 12px 0; }
        .section h3 { margin: 0 0 6px 0; color: #141417; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { border: 1px solid #e5e5e5; padding: 5px 7px; text-align: left; font-size: 10.5px; }
        th { background: #ffffff; color: #141417; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 9.5px; border-bottom: 2px solid #141417; }
        tr:nth-child(even):not(.group-separator):not(.grouped-row):not(.totals-row) { background: #fafafa; }
        .group-separator { background: #e5e7eb !important; color: #141417; }
        .group-separator td { padding: 4px 7px; border-color: #d4d4d8; font-size: 10.5px; text-transform: lowercase; letter-spacing: 0.3px; }
        .group-separator strong { color: #141417; font-weight: 700; text-transform: lowercase; }
        .grouped-row { background: #fafafa; }
        .flags { font-weight: 600; color: #141417; font-size: 10px; text-align: center; }
        .totals-row td { background: #f5f5f5; border-top: 2px solid #141417; font-weight: 700; color: #141417; }
        .terms { margin: 14px 0 10px; padding: 10px 14px; border: 1px solid #e5e5e5; border-radius: 6px; background: #fafafa; }
        .terms h3 { margin: 0 0 5px 0; color: #141417; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        .terms p { color: #3f3f46; font-size: 9.5px; line-height: 1.5; margin: 2px 0; }
        .terms-hebrew { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #d4d4d8; direction: rtl; text-align: right; }
        .terms-hebrew p { font-size: 9.5px; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 18px 0 8px; }
        .sig-block p { margin: 0 0 18px 0; color: #141417; font-size: 11px; font-weight: 600; }
        .sig-line { border-bottom: 1px solid #141417; height: 30px; }
        .sig-caption { margin-top: 3px; font-size: 9.5px; color: #a1a1aa; }
        .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e5e5; text-align: center; color: #71717a; font-size: 9.5px; line-height: 1.5; }
        .footer strong { color: #3f3f46; }
        @media print {
          body { padding: 14px 20px; }
          .page-break { page-break-before: always; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="company-header">
        <div class="company-brand">
          <img src="${absoluteLogo}" alt="${COMPANY_INFO.displayName}" onerror="this.style.display='none'" />
          <div class="name-block">
            <span class="display-name">${COMPANY_INFO.displayName}</span>
            <span class="legal-name">${COMPANY_INFO.legalName}</span>
          </div>
        </div>
      </div>

      <div class="doc-title-bar">
        <h1>${docTitle}</h1>
        <div class="job-number">${formattedDate}</div>
      </div>

      <div class="job-meta-row">
        <div class="cell flex1">
          <span class="meta-label">Client</span>
          <span class="meta-value">
            ${esc(client?.name || job.client_name || "N/A")}
            ${client?.email ? `<span class="sub"> · ${esc(client.email)}</span>` : ""}
            ${client?.phone ? `<span class="sub"> · ${esc(client.phone)}</span>` : ""}
          </span>
        </div>
        <div class="cell">
          <span class="meta-label">Service Type</span>
          <span class="meta-value">${esc(job.service_type)}</span>
        </div>
      </div>

      <div class="section">
        <h3>Stones</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 28px;">#</th>
              <th>SKU</th>
              <th>Type</th>
              <th>Weight</th>
              <th>Shape</th>
              <th style="width: 70px; text-align: center;">Flags</th>
              <th>Value</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            ${ungroupedRows}
            ${groupedRows}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="3"><strong>Total — ${totalStonesCount} stone${totalStonesCount === 1 ? "" : "s"} · ${totalCertificates} certificate${totalCertificates === 1 ? "" : "s"}</strong></td>
              <td><strong>${totalWeight.toFixed(2)} ct</strong></td>
              <td></td>
              <td></td>
              <td><strong>$${fmt(totalValueAll)}</strong></td>
              <td><strong>$${fmt(totalFeeAll)}</strong></td>
            </tr>
          </tfoot>
        </table>
        <div style="font-size: 9.5px; color: #a1a1aa; margin-top: 4px;">Flags: CS = Color Stability Test · Mtd = Mounted in jewellery</div>
        ${
          hasDiscount
            ? `<div style="margin-top:8px;font-size:11px;color:#3f3f46;text-align:right;">
                Subtotal $${fmt(subtotal)} · <span style="color:#c2410c;">Discount &minus;$${fmt(job.discount || 0)}</span> · <strong style="color:#141417;">Total Fee $${fmt(job.total_fee || 0)}</strong>
              </div>`
            : ""
        }
      </div>

      ${
        job.notes
          ? `<div class="section"><h3>Notes</h3><p style="font-size:11px;color:#3f3f46;margin:0;">${esc(job.notes)}</p></div>`
          : ""
      }

      <div class="terms">
        <h3>Terms & Conditions</h3>
        <p>The customer agrees to pay the above fees immediately upon delivery of the goods, unconditional of results.</p>
        <p>Refusal of payment will justify the non-return of goods to the customer.</p>
        <p>The fees above are an estimated cost of certificates based on details supplied by the customer. The lab will determine the final fees after the inspection of the goods.</p>
        ${
          isIsraelBranch
            ? `<div class="terms-hebrew">
                <p>הלקוח מתחייב לשלם את העלויות הנקובות לעיל מיד עם מסירת הטובין ללא תלות בתוצאות המעבדה</p>
                <p>סירוב לשלם את העלויות הנ"ל תהיה עילה מוצדקת לאי החזרת הטובין ללקוח</p>
                <p>העלויות לעיל הינן הערכה של עלויות התעודות בהתבסס על הנתונים שנמסרו ע"י הלקוח.</p>
                <p>המחיר הסופי ייקבע ע"י המעבדה לאחר בחינה של הטובין והערכת שוויים</p>
              </div>`
            : ""
        }
      </div>

      <div class="signatures">
        <div class="sig-block">
          <p>Client Signature</p>
          <div class="sig-line"></div>
          <div class="sig-caption">Date: ____________________</div>
        </div>
        <div class="sig-block">
          <p>Lab Representative</p>
          <div class="sig-line"></div>
          <div class="sig-caption">Date: ____________________</div>
        </div>
      </div>

      <div class="footer">
        <div><strong>${COMPANY_INFO.legalName}</strong> · ${COMPANY_INFO.address}</div>
        <div>${COMPANY_INFO.phones.join(" · ")} · ${COMPANY_INFO.email} · VAT ${COMPANY_INFO.vat}</div>
        <div style="margin-top:4px;">Printed ${formattedPrintedAt}</div>
      </div>

      <script>
        // Wait for logo to load, then print
        window.addEventListener('load', function() {
          setTimeout(function() { window.print(); }, 200);
        });
      </script>
    </body>
    </html>
  `;
}
