/**
 * HTML escape any untrusted string before interpolating into a print/HTML template.
 * Used in client-side print window generation to prevent XSS via client names,
 * notes, SKUs, or other lab-supplied fields.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Open a popup window that renders the given HTML document via a Blob URL.
 * Replaces the legacy `window.open('', '_blank') + document.write(html)` pattern
 * (which trips no-document-write XSS lint rules and is harder to audit).
 *
 * The HTML must be a complete document. If it needs to auto-print, include an
 * inline `<script>window.addEventListener('load', () => window.print())</script>`
 * — the parent window cannot drive the popup once we're using a Blob URL.
 *
 * Returns the popup Window handle, or null if blocked.
 */
export function openPrintWindow(html: string): Window | null {
  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  if (win) {
    // Give the popup ample time to load + print, then release the Blob.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } else {
    URL.revokeObjectURL(blobUrl);
  }
  return win;
}
