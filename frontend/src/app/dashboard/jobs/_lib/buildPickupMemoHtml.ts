/**
 * Pickup memo HTML builders — generates the printable "Memo Return" and
 * "Certificate Collection" documents the client signs when collecting
 * stones / certificates from the lab.
 *
 * Reuses the visual language of the intake memo (`buildJobMemoHtml.ts`)
 * but renders only the subset of stones included in the pickup, plus the
 * appropriate title and signature block. When a digital `client_collection`
 * or `cert_collection` signature is captured, its PNG embeds in place of
 * the printed signature line.
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

  // Totals (only over the picked subset).
  const totalCount = picked.length;
  const totalWeight = picked.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  const totalValue = picked.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
  const paddedJobNumber = String(job.job_number).padStart(5, "0");
  const today = new Date().toLocaleDateString();
  const title = TITLES[type];
  const subtitle = SUBTITLES[type];

  // Group stones by certificate_group so paired/parcel certs render as
  // ONE row in the cert_collection case (client takes one cert covering
  // multiple stones).
  const rowsHtml = (() => {
    if (type === "cert_collection") {
      // Bucket by cert group; ungrouped stones each form their own bucket.
      const groups = new Map<string, Stone[]>();
      for (const s of picked) {
        const key = s.certificate_group != null ? `g:${s.certificate_group}` : `s:${s.id}`;
        const bucket = groups.get(key) || [];
        bucket.push(s);
        groups.set(key, bucket);
      }
      return Array.from(groups.values())
        .map((bucket) => {
          const head = bucket[0];
          const certLabel =
            head.certificate_group != null ? `Cert ${head.certificate_group}` : "Single";
          const stoneSummary = bucket
            .map((s) => `${esc(s.sku)} (${esc(s.stone_type)})`)
            .join(", ");
          const totalCt = bucket.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
          const totalVal = bucket.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
          return `
            <tr>
              <td>${certLabel}</td>
              <td>${stoneSummary}</td>
              <td>${totalCt.toFixed(2)} ct</td>
              <td>$${totalVal.toLocaleString()}</td>
            </tr>
          `;
        })
        .join("");
    }
    // memo_return — one row per stone.
    return picked
      .map(
        (s) => `
        <tr>
          <td>${esc(s.sku)}</td>
          <td>${esc(s.stone_type)}</td>
          <td>${(Number(s.weight) || 0).toFixed(2)} ct</td>
          <td>${esc(s.shape || "—")}</td>
          <td>$${(Number(s.value) || 0).toLocaleString()}</td>
          <td>${s.certificate_group != null ? `Cert ${s.certificate_group}` : "—"}</td>
        </tr>
      `,
      )
      .join("");
  })();

  // Client signature block — embedded PNG if captured, blank line otherwise.
  const clientSigBlock = (() => {
    if (signature && signature.status === "signed" && signature.signed_url) {
      const when = signature.signed_at
        ? new Date(signature.signed_at).toLocaleString()
        : "";
      return `
        <img src="${esc(signature.signed_url)}" alt="Picked-up signature"
             style="height:54px;object-fit:contain;max-width:100%;display:block;" />
        <div class="sig-caption" style="margin-top:4px;">
          ${esc(signature.signer_name)} · ${esc(when)}
        </div>`;
    }
    return `<div class="sig-line"></div>
            <div class="sig-caption">Date: ____________________</div>`;
  })();

  const tableHeader =
    type === "cert_collection"
      ? `<th>Certificate</th><th>Stones</th><th>Total Weight</th><th>Total Value</th>`
      : `<th>SKU</th><th>Type</th><th>Weight</th><th>Shape</th><th>Value</th><th>Certificate</th>`;
  const colCount = type === "cert_collection" ? 4 : 6;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} · Job #${paddedJobNumber}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         color: #0a1a3f; padding: 32px; margin: 0; max-width: 880px; }
  header { display:flex; align-items:flex-start; justify-content:space-between;
           border-bottom: 2px solid #0a1a3f; padding-bottom: 16px; margin-bottom: 24px; }
  .company h1 { margin: 0; font-size: 22px; }
  .company p { margin: 2px 0; font-size: 12px; color: #4a5a7a; }
  .doc-meta { text-align: right; }
  .doc-meta .badge { display:inline-block; padding: 4px 10px; border-radius: 12px;
                     background: #0a1a3f; color: #fff; font-size: 11px;
                     letter-spacing: 0.08em; text-transform: uppercase; }
  .doc-meta h2 { margin: 8px 0 4px; font-size: 20px; }
  .doc-meta p { margin: 0; color: #4a5a7a; font-size: 12px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
             margin-bottom: 18px; }
  .summary .cell { background: #f4f6fb; border: 1px solid #d8dfee;
                    padding: 8px 12px; border-radius: 6px; }
  .summary .cell .k { font-size: 10px; text-transform: uppercase;
                       letter-spacing: 0.08em; color: #4a5a7a; }
  .summary .cell .v { font-size: 14px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #f4f6fb; padding: 8px;
       border-bottom: 1px solid #d8dfee; font-size: 11px; text-transform: uppercase;
       letter-spacing: 0.05em; color: #4a5a7a; }
  td { padding: 8px; border-bottom: 1px solid #eef1f7; }
  tfoot td { font-weight: 600; background: #f4f6fb; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px;
                margin-top: 32px; padding-top: 24px; border-top: 1px solid #d8dfee; }
  .sig-block p { margin: 0 0 8px; font-size: 11px; text-transform: uppercase;
                  letter-spacing: 0.08em; color: #4a5a7a; }
  .sig-line { border-bottom: 1px solid #0a1a3f; height: 40px; }
  .sig-caption { margin-top: 4px; font-size: 11px; color: #4a5a7a; }
  .legal { margin-top: 24px; padding: 12px; background: #f4f6fb;
           border-left: 3px solid #0a1a3f; font-size: 11px; color: #4a5a7a;
           line-height: 1.5; }
  @media print { body { padding: 0; max-width: none; } }
</style>
</head>
<body>
<header>
  <div class="company">
    <h1>${esc(COMPANY_INFO.displayName)}</h1>
    <p>${esc(branch?.name || "")}</p>
    <p>${esc(branch?.address || "")}</p>
  </div>
  <div class="doc-meta">
    <span class="badge">${title}</span>
    <h2>Job #${paddedJobNumber}</h2>
    <p>${esc(today)}</p>
  </div>
</header>

<div class="summary">
  <div class="cell">
    <div class="k">Client</div>
    <div class="v">${esc(client?.name || job.client_name || "—")}</div>
  </div>
  <div class="cell">
    <div class="k">Items</div>
    <div class="v">${totalCount}</div>
  </div>
  <div class="cell">
    <div class="k">Total Value</div>
    <div class="v">$${totalValue.toLocaleString()}</div>
  </div>
</div>

<table>
  <thead><tr>${tableHeader}</tr></thead>
  <tbody>
    ${rowsHtml || `<tr><td colspan="${colCount}" style="text-align:center;color:#4a5a7a;padding:24px;">No items selected</td></tr>`}
  </tbody>
  ${
    type === "memo_return"
      ? `<tfoot><tr>
          <td colspan="2">TOTAL</td>
          <td>${totalWeight.toFixed(2)} ct</td>
          <td></td>
          <td>$${totalValue.toLocaleString()}</td>
          <td></td>
        </tr></tfoot>`
      : ""
  }
</table>

<div class="legal">${esc(subtitle)}</div>

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

<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body>
</html>`;
}
