/**
 * Pickup memo HTML builders — generates the printable "Memo Return" and
 * "Certificate Collection" documents the client signs when collecting
 * stones / certificates from the lab.
 *
 * As of Feb 26 2026 the visual language mirrors the main job memo
 * (`buildJobMemoHtml.ts`): same company header, doc-title-bar, gray
 * job-meta-row, section/table styles, signatures grid and footer. The
 * only intentional differences vs. the intake memo:
 *
 *   - No "Terms & Conditions" block (the client already agreed to those
 *     at drop-off; return docs are just receipts).
 *   - No "Fee" column (fees were already settled before pickup).
 *   - cert_collection groups rows by `certificate_group` so paired/parcel
 *     certs render as one line covering N stones.
 *
 * When a digital `client_collection` or `cert_collection` signature is
 * captured, its PNG embeds in place of the printed signature line. The
 * backend-side `{{SIGNATURE_BLOCK}}` placeholder is emitted when the
 * caller passes `signature: { __template: true }` so xhtml2pdf can swap
 * in the captured PNG when archiving the immutable PDF.
 */

import { escapeHtml as esc } from "@/lib/sanitize";
import { COMPANY_INFO } from "../_helpers";
import type { Job, Stone, Client, Branch } from "../_types";
import type { SignatureRow } from "@/lib/api";

interface BuildPickupMemoArgs {
  job: Job;
  client: Client | undefined;
  branch: Branch | undefined;
  origin: string;
  type: "memo_return" | "cert_collection";
  /** Stone IDs included in THIS pickup event — drives which rows show in
   *  the table and the totals row. */
  pickedStoneIds: string[];
  /** Optional captured signature for this pickup; if present, embedded
   *  in the "picked up by" block. */
  signature?: SignatureRow | null;
}

const TITLES: Record<BuildPickupMemoArgs["type"], string> = {
  memo_return: "Memo Return",
  cert_collection: "Certificate Collection",
};

const SUBTITLES: Record<BuildPickupMemoArgs["type"], string> = {
  memo_return:
    "By signing below I confirm receipt of the stones listed in this memo.",
  cert_collection:
    "By signing below I confirm receipt of the certificates listed in this memo.",
};

const fmt = (n: number): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelKey = (count: number): string => {
  if (count === 1) return "single";
  if (count === 2) return "pair";
  if (count >= 3 && count <= 6) return "layout";
  return "multi-stone";
};

/** Memo-return row — mirrors buildJobMemoHtml's stoneRow(). Includes Fee
 *  column for parity with the intake memo (per user request Feb 27 2026
 *  — surfaces the per-stone fee on the return doc too). */
const memoReturnRow = (
  index: number,
  stone: Stone,
  isGrouped: boolean,
): string => {
  const flags: string[] = [];
  if (stone.color_stability_test) flags.push("CS");
  if (stone.mounted) flags.push("Mtd");
  const flagsStr = flags.length > 0 ? flags.join(", ") : "—";
  const isParcel = stone.kind === "parcel";
  const typeCell = isParcel
    ? `${esc(stone.stone_type)} <span style="color:#a16207;font-weight:600;">· parcel of ${stone.stone_count || 0}</span>`
    : esc(stone.stone_type);
  // Prefer admin override (`actual_fee`) when present; otherwise the
  // bracket-computed `fee`.
  const feeValue = stone.actual_fee != null ? stone.actual_fee : (stone.fee || 0);
  return `
    <tr class="${isGrouped ? "grouped-row" : ""}${isParcel ? " parcel-row" : ""}">
      <td>${index}</td>
      <td>${esc(stone.sku)}</td>
      <td>${typeCell}</td>
      <td>${esc(String(stone.weight))} ct${isParcel ? ` <span style="color:#71717a;font-size:9px;">(total)</span>` : ""}</td>
      <td>${esc(stone.shape)}</td>
      <td class="flags">${flagsStr}</td>
      <td>$${fmt(stone.value || 0)}</td>
      <td>$${fmt(feeValue)}</td>
    </tr>
  `;
};

export function buildPickupMemoHtml({
  job,
  client,
  branch,
  origin,
  type,
  pickedStoneIds,
  signature = null,
}: BuildPickupMemoArgs): string {
  const idSet = new Set(pickedStoneIds);
  const picked: Stone[] = (job.stones || []).filter((s) => idSet.has(s.id));

  const paddedJobNumber = String(job.job_number).padStart(5, "0");
  const title = TITLES[type];
  const subtitle = SUBTITLES[type];
  const docTitle = `${title} #${paddedJobNumber}`;

  const absoluteLogo = COMPANY_INFO.logoUrl.startsWith("http")
    ? COMPANY_INFO.logoUrl
    : origin + COMPANY_INFO.logoUrl;

  const formattedDate = new Date().toLocaleDateString("en-GB", {
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

  // ---- Build the body (table + section) -----------------------------------
  let sectionHtml = "";

  if (type === "memo_return") {
    // Mirror the memo's grouped-by-certificate layout so the pickup
    // table reads like a familiar subset of the original intake memo.
    const ungrouped = picked.filter((s) => !s.certificate_group);
    const groupedMap = new Map<number, Stone[]>();
    picked
      .filter((s) => s.certificate_group)
      .forEach((s) => {
        const g = s.certificate_group!;
        if (!groupedMap.has(g)) groupedMap.set(g, []);
        groupedMap.get(g)!.push(s);
      });
    const sortedGroups = Array.from(groupedMap.entries()).sort(([a], [b]) => a - b);
    const groupLabels = new Map<number, string>();
    const typeCounters: Record<string, number> = {};
    sortedGroups.forEach(([groupNum, stones]) => {
      const key = labelKey(stones.length);
      typeCounters[key] = (typeCounters[key] || 0) + 1;
      groupLabels.set(groupNum, `${key}-${typeCounters[key]}`);
    });

    let rowIndex = 1;
    const ungroupedRows = ungrouped.map((s) => memoReturnRow(rowIndex++, s, false)).join("");
    const groupedRows = sortedGroups
      .map(([groupNum, stones]) => {
        const label = groupLabels.get(groupNum) || "group";
        const header = `
          <tr class="group-separator">
            <td colspan="8">
              <strong>${label}</strong> (${stones.length} stone${stones.length > 1 ? "s" : ""})
            </td>
          </tr>`;
        const rows = stones.map((s) => memoReturnRow(rowIndex++, s, true)).join("");
        return header + rows;
      })
      .join("");

    const totalWeight = picked.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    const totalValue = picked.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
    const totalFee = picked.reduce(
      (sum, s) => sum + (s.actual_fee != null ? s.actual_fee : (Number(s.fee) || 0)),
      0,
    );
    const totalStonesCount = picked.reduce(
      (sum, s) => sum + (s.kind === "parcel" ? (s.stone_count || 1) : 1),
      0,
    );
    const totalCertificates = groupedMap.size + ungrouped.length;

    sectionHtml = `
      <div class="section">
        <h3>Stones Returned</h3>
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
            ${picked.length === 0
              ? `<tr><td colspan="8" style="text-align:center;color:#a1a1aa;padding:18px;">No items selected</td></tr>`
              : ""}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="3"><strong>Total — ${totalStonesCount} stone${totalStonesCount === 1 ? "" : "s"} · ${totalCertificates} certificate${totalCertificates === 1 ? "" : "s"}</strong></td>
              <td><strong>${totalWeight.toFixed(2)} ct</strong></td>
              <td></td>
              <td></td>
              <td><strong>$${fmt(totalValue)}</strong></td>
              <td><strong>$${fmt(totalFee)}</strong></td>
            </tr>
          </tfoot>
        </table>
        <div style="font-size: 9.5px; color: #a1a1aa; margin-top: 4px;">Flags: CS = Color Stability Test · Mtd = Mounted in jewellery</div>
      </div>`;
  } else {
    // cert_collection — one row per certificate group (pair/parcel certs
    // collapse to a single line covering N stones). Columns adapted to
    // certificate-relevant fields pulled from verbal_findings.
    const groups = new Map<string, Stone[]>();
    for (const s of picked) {
      const key = s.certificate_group != null ? `g:${s.certificate_group}` : `s:${s.id}`;
      const bucket = groups.get(key) || [];
      bucket.push(s);
      groups.set(key, bucket);
    }
    const certRows = Array.from(groups.values())
      .map((bucket) => {
        const head = bucket[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vf: any = (head.verbal_findings && typeof head.verbal_findings === "object")
          ? head.verbal_findings : {};
        const certId = vf.certificate_id || (head.certificate_group != null
          ? `Group ${head.certificate_group}`
          : "—");
        const identification = vf.identification || head.stone_type || "—";
        const totalCt = bucket.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
        const color = vf.color || "—";
        const stonesNote = bucket.length > 1
          ? `${bucket.length} stones (${bucket.map((s) => esc(s.sku)).join(", ")})`
          : esc(head.sku);
        const bucketFee = bucket.reduce(
          (sum, s) => sum + (s.actual_fee != null ? s.actual_fee : (Number(s.fee) || 0)),
          0,
        );
        return `
          <tr>
            <td>${esc(certId)}</td>
            <td>${esc(identification)}</td>
            <td>${totalCt.toFixed(2)} ct</td>
            <td>${esc(color)}</td>
            <td style="font-size:10px;color:#71717a;">${stonesNote}</td>
            <td>$${fmt(bucketFee)}</td>
          </tr>`;
      })
      .join("");

    const certTotalFee = picked.reduce(
      (sum, s) => sum + (s.actual_fee != null ? s.actual_fee : (Number(s.fee) || 0)),
      0,
    );

    sectionHtml = `
      <div class="section">
        <h3>Certificates Collected</h3>
        <table>
          <thead>
            <tr>
              <th>Certificate</th>
              <th>Identification</th>
              <th>Weight</th>
              <th>Color</th>
              <th>Stones</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            ${certRows || `<tr><td colspan="6" style="text-align:center;color:#a1a1aa;padding:18px;">No certificates selected</td></tr>`}
          </tbody>
          <tfoot>
            <tr class="totals-row">
              <td colspan="5"><strong>Total — ${groups.size} certificate${groups.size === 1 ? "" : "s"}</strong></td>
              <td><strong>$${fmt(certTotalFee)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }

  // ---- Signature block (matches the memo's logic) -------------------------
  const clientSigBlock = (() => {
    if (signature && (signature as { __template?: boolean }).__template) {
      return `{{SIGNATURE_BLOCK}}`;
    }
    if (signature && signature.status === "signed" && signature.signed_url) {
      const when = signature.signed_at
        ? new Date(signature.signed_at).toLocaleString()
        : "";
      return `
        <img src="${esc(signature.signed_url)}" alt="Picked-up signature"
             style="height:110px;object-fit:contain;max-width:100%;display:block;" />
        <div class="sig-caption" style="margin-top:4px;">
          ${esc(signature.signer_name)} · ${esc(when)}
        </div>`;
    }
    return `
      <div class="sig-line"></div>
      <div class="sig-caption">Date: ____________________</div>`;
  })();

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${title} #${job.job_number} — ${COMPANY_INFO.displayName}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { min-height: 100vh; }
        @page { size: A4; margin: 12mm 14mm; }
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          padding: 22px 32px;
          max-width: 900px;
          margin: 0 auto;
          color: #141417;
          line-height: 1.4;
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 0px);
        }
        /* Pushes the confirm-line + signatures + footer to the bottom
           when the table is short — matches the intake memo behaviour. */
        .page-spacer { flex: 1 1 auto; min-height: 12px; }
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
        .confirm-line { margin: 14px 0 10px; padding: 10px 14px; border: 1px solid #e5e5e5; border-radius: 6px; background: #fafafa; font-size: 10.5px; color: #3f3f46; }
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
          <span class="meta-label">Branch</span>
          <span class="meta-value">${esc(branch?.name || job.branch_name || "—")}</span>
        </div>
      </div>

      ${sectionHtml}

      <div class="page-spacer"></div>

      <div class="confirm-line">${esc(subtitle)}</div>

      <div class="signatures">
        <div class="sig-block">
          <p>Picked Up By</p>
          ${clientSigBlock}
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
        window.addEventListener('load', function() {
          setTimeout(function() { window.print(); }, 200);
        });
      </script>
    </body>
    </html>
  `;
}
