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
