// The ⋯ menu (plan 2026-08-29-plan-post-and-thread, Phase 3; decisions 3 + 4).
//
// One component for a post row, a thread head and a comment: `groups` is an
// array of arrays of items, drawn with a rule between groups — no headings,
// no submenus. Destructive items go last and say so with `danger`.
//
// Native <dialog> + showModal(), the authsheet's pattern (lens-views.js): it
// supplies focus entry, Esc, focus return to the trigger, and background
// inertness with no code. The SAME element is a popover beside the kebab on a
// desktop and a bottom sheet on a phone — CSS moves the box at 480px; the only
// thing JS decides is whether to pin it next to its anchor.
//
// Built fresh per open and removed on close, so a menu never shows a stale
// Save/Unsave from the last time it was opened.
import { el } from '../util.js';

const PHONE = '(max-width: 480px)';

export function openMenu({ anchor, groups, label = 'Options' }) {
  const items = [];
  const list = el('div', { role: 'menu', 'aria-label': label });
  groups.filter((g) => g && g.length).forEach((group, gi) => {
    if (gi > 0) list.append(el('div', { class: 'msep', role: 'separator' }));
    for (const item of group) {
      const b = el('button', { type: 'button', role: 'menuitem', class: 'mi' + (item.danger ? ' danger' : ''), tabindex: '-1' },
        el('span', {}, item.label), item.icon ? el('span', { class: 'mi-icon', 'aria-hidden': 'true' }, item.icon) : null);
      b.addEventListener('click', async () => {
        dialog.close();
        try { await item.onSelect?.(); }
        catch (e) { console.warn('forage: menu action failed', e); }
      });
      items.push(b);
      list.append(b);
    }
  });

  const close = el('button', { type: 'button', class: 'sheet-close', 'aria-label': 'Close' }, '✕');
  close.addEventListener('click', () => dialog.close());
  const dialog = el('dialog', { class: 'menu', 'aria-label': label },
    el('div', { class: 'sheet-title' }, label, close), list);

  // the backdrop is part of the dialog's box: a click that lands on the
  // dialog itself (not on a child) is a click outside the menu
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
      : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  });
  dialog.addEventListener('close', () => {
    anchor?.setAttribute('aria-expanded', 'false');
    dialog.remove();
    anchor?.focus();
  });

  document.body.append(dialog);
  anchor?.setAttribute('aria-expanded', 'true');
  if (anchor && !window.matchMedia(PHONE).matches) pinTo(dialog, anchor);
  dialog.showModal();
  items[0]?.focus();
  return dialog;
}

// Desktop: right-align the popover under its kebab, kept inside the viewport.
function pinTo(dialog, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = 270;
  const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
  dialog.style.margin = '0';
  dialog.style.width = `${w}px`;
  dialog.style.left = `${Math.round(left)}px`;
  // below the anchor, or above it when the bottom of the screen is near
  const below = r.bottom + 4;
  dialog.style.top = `${Math.round(below + 320 > window.innerHeight ? Math.max(8, r.top - 4 - 320) : below)}px`;
}
