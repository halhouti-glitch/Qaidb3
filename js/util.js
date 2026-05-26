/**
 * Small framework-free helpers used throughout the app.
 * Keep this file pure — no DOM, no global state — so it can be reused
 * everywhere (including the canvas share renderer + tests).
 */

/**
 * Escape user-controlled text for safe insertion into innerHTML.
 * Always prefer textContent for plain strings; use this only when building
 * HTML strings with interpolated user data (e.g. inside template literals).
 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/**
 * Convert any CSS color string ("#rgb", "#rrggbb", "rgb(...)", "rgba(...)")
 * to an rgba() string with the given alpha. Falls back to the original if
 * the format isn't recognized.
 */
export function withAlpha(color, alpha) {
  if (color.startsWith('rgba')) {
    return color.replace(/rgba\(([^)]+)\)/, (_, body) => {
      const parts = body.split(',').map((s) => s.trim());
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    });
  }
  if (color.startsWith('rgb(')) {
    return color.replace(/rgb\(([^)]+)\)/, (_, body) => `rgba(${body}, ${alpha})`);
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const v = hex.length === 3
      ? hex.split('').map((c) => parseInt(c + c, 16))
      : [parseInt(hex.slice(0, 2), 16),
         parseInt(hex.slice(2, 4), 16),
         parseInt(hex.slice(4, 6), 16)];
    return `rgba(${v[0]},${v[1]},${v[2]},${alpha})`;
  }
  return color;
}
