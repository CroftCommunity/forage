// Theme control (global, not per-persona so it works logged out). Three states:
// 'auto' (follow OS), 'light', 'dark'. Persisted under its own key. The initial
// apply also happens inline in index.html <head> to avoid a flash of the wrong
// theme before this module loads.

const KEY = 'graze.theme';
const mql = window.matchMedia('(prefers-color-scheme: dark)');

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}
export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch {}
  apply();
  for (const fn of listeners) fn(t);
}
export function apply() {
  const t = getTheme();
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}
export function resolvedDark() {
  const t = getTheme();
  return t === 'dark' || (t === 'auto' && mql.matches);
}
// Toggle flips to the explicit opposite of what's currently showing.
export function toggle() { setTheme(resolvedDark() ? 'light' : 'dark'); }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Re-apply on OS change while in 'auto' so the toggle icon stays correct.
mql.addEventListener?.('change', () => { if (getTheme() === 'auto') { apply(); for (const fn of listeners) fn('auto'); } });
