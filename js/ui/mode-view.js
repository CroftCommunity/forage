// The /mode surface (3h) — the ONE place the presentation mode is chosen.
// Shared by both populations (deliberately imports neither): describes each,
// shows which is active AND WHY (your choice vs the domain default), sets or
// clears the device-local choice, and reloads for a clean population swap.

import { el } from '../util.js';
import * as mode from '../mode.js';

export function modeView() {
  const act = mode.active();
  const chosen = mode.stored();

  const swap = (m) => {
    mode.set(m);
    location.hash = '/';
    location.reload(); // a population swap is a fresh boot — no half-worlds
  };

  const card = (id) => {
    const p = mode.PRESENTATIONS[id];
    const isActive = act === id;
    const btn = el('button', { class: 'btn' + (isActive ? '' : ' primary') },
      isActive ? 'Active' : `Use ${p.label}`);
    if (isActive) btn.disabled = true;
    else btn.addEventListener('click', () => swap(id));
    return el('div', { class: 'card', 'data-mode-card': id, style: isActive ? 'outline:2px solid var(--brand-ink)' : '' },
      el('h2', {}, p.label),
      el('p', { class: 'small' }, p.blurb),
      isActive ? el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
        chosen ? 'Active — your choice on this device.' : `Active — the domain default (no choice stored).`) : null,
      btn);
  };

  const clearRow = chosen
    ? (() => {
        const b = el('button', { class: 'btn sm' }, `Clear my choice — follow the domain default (${mode.PRESENTATIONS[mode.DOMAIN_DEFAULT].label})`);
        b.addEventListener('click', () => {
          mode.clear();
          location.hash = '/';
          location.reload();
        });
        return el('div', { class: 'card' },
          el('div', { class: 'xs muted', style: 'margin-bottom:6px' },
            'Your choice is stored on this device only. Clearing it means this device follows whatever the domain defaults to.'),
          b);
      })()
    : el('div', { class: 'xs muted' },
        `No choice stored — this device follows the domain default (${mode.PRESENTATIONS[mode.DOMAIN_DEFAULT].label}).`);

  return {
    main: el('div', {},
      el('h1', {}, 'Mode'),
      el('p', { class: 'small muted' },
        'Forage is one of two things at a time — full populations, never mixed. The routes mean whichever is active.'),
      card('bluesky'),
      card('memory'),
      clearRow),
    side: null,
  };
}

// The gate for a route that belongs to the OTHER population — words, never a
// silent redirect, so the exclusivity is legible.
export function wrongPopulation(wanted) {
  const p = mode.PRESENTATIONS[wanted];
  return {
    main: el('div', { class: 'empty' },
      el('h2', {}, `That page lives in the ${p.label}`),
      el('p', { class: 'muted' },
        `You are in the ${mode.PRESENTATIONS[mode.active()].label}. Populations do not mix — switch modes to see it.`),
      el('a', { class: 'btn primary', href: '#/mode' }, 'Open Mode'),
      ' ',
      el('a', { class: 'btn', href: '#/' }, 'Go home')),
    side: null,
  };
}
