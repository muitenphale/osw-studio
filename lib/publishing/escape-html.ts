/**
 * Escape HTML special characters.
 *
 * Shared by the publishing injectors, which interpolate user- and reviewer-supplied strings into
 * published markup. Keeping one copy means a fix here reaches every injection site.
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
