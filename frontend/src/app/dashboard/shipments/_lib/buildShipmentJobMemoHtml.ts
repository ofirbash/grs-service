/**
 * Pure-function builder for the shipment-context job memo (printable from
 * the shipment detail dialog). Mirrors `jobs/_lib/buildJobMemoHtml` in role
 * but uses the older lab-classic styling that the shipments page already
 * shipped with — keeping byte-identical output to avoid visual regression.
 *
 * Cancelled stones are excluded from the table AND from the totals strip.
 */
import { escapeHtml as esc } from "@/lib/sanitize";
import type { Job } from "../_types";

export function buildShipmentJobMemoHtml(job: Job): string {
  const activeStones = (job.stones || []).filter((s) => !s.cancelled);

  const stonesTableHtml =
    activeStones.length > 0
      ? `
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
              <th>Certificate</th>
            </tr>
          </thead>
          <tbody>
            ${activeStones
              .map(
                (stone, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${esc(stone.sku)}</td>
                <td>${esc(stone.stone_type)}</td>
                <td>${stone.weight} ct</td>
                <td>${esc(stone.shape)}</td>
                <td>$${stone.value.toLocaleString()}</td>
                <td>$${stone.fee.toLocaleString()}</td>
                <td>${stone.certificate_group ? `Cert ${stone.certificate_group}` : "-"}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `
      : "<p>No stones in this job</p>";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Job #${job.job_number} - Bashari Lab-Direct</title>
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
        .totals { margin-top: 20px; text-align: right; padding: 15px; background: #102a43; color: white; border-radius: 6px; }
        .totals .item { display: inline-block; margin-left: 30px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; text-align: center; color: #627d98; font-size: 12px; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">Bashari Lab-Direct</div>
        <div>Job #${job.job_number}</div>
      </div>

      <div class="section">
        <h3>Job Details</h3>
        <div class="grid">
          <div class="field">
            <div class="label">Client</div>
            <div class="value">${esc(job.client_name || "N/A")}</div>
          </div>
          <div class="field">
            <div class="label">Branch</div>
            <div class="value">${esc(job.branch_name || "N/A")}</div>
          </div>
          <div class="field">
            <div class="label">Service Type</div>
            <div class="value">${esc(job.service_type || "N/A")}</div>
          </div>
          <div class="field">
            <div class="label">Status</div>
            <div class="value">${job.status.replace(/_/g, " ")}</div>
          </div>
          <div class="field">
            <div class="label">Total Stones</div>
            <div class="value">${job.total_stones}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h3>Stones</h3>
        ${stonesTableHtml}

        <div class="totals">
          <div class="item"><strong>Total Stones:</strong> ${job.total_stones}</div>
          <div class="item"><strong>Total Value:</strong> $${job.total_value.toLocaleString()}</div>
          <div class="item"><strong>Total Fee:</strong> $${job.total_fee.toLocaleString()}</div>
        </div>
      </div>

      ${
        job.notes
          ? `
      <div class="section">
        <h3>Notes</h3>
        <p>${esc(job.notes)}</p>
      </div>
      `
          : ""
      }

      <div class="footer">
        <p>Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        <p>Bashari Lab-Direct</p>
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
