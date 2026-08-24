// Dev bar (spec §9). Persona switch re-derives all viewer-dependent views in one
// place (the store notify). Dashed background marks it as scaffolding, not chrome.

import * as store from './store.js';
import * as storage from './storage.js';
import { PERSONAS } from './personas.js';
import { buildSeed } from '../data/seed.js';
import { el } from './util.js';
import { toast } from './ui/components.js';

export function devBar() {
  const bar = el('div', { class: 'devbar' });

  // persona dropdown
  const sel = el('select', { title: 'Active persona' },
    ...PERSONAS.map((p) => el('option', { value: p.id === null ? '' : p.id, selected: p.id === store.getPersonaId() || false }, p.label)));
  // include any runtime-created accounts not in the static roster
  for (const u of Object.values(store.getState().users)) {
    if (!PERSONAS.some((p) => p.id === u.id)) sel.append(el('option', { value: u.id, selected: u.id === store.getPersonaId() || false }, u.handle + ' (new)'));
  }
  sel.addEventListener('change', () => store.setPersona(sel.value === '' ? null : sel.value));
  bar.append(el('span', { class: 'grp' }, el('label', {}, 'Persona'), sel));

  bar.append(sep());

  // seed / delete / export / import
  bar.append(el('span', { class: 'grp' },
    mkBtn('Seed', () => { store.loadEvents(buildSeed()); toast('Seeded.', 'ok'); }),
    mkBtn('Delete All', () => { if (confirm('Delete all local data?')) { store.reset(); toast('Cleared.', ''); } }),
    mkBtn('Export', exportData),
    mkBtn('Import', importData)));

  bar.append(sep());

  // latency toggle 0/250/600
  const lat = el('select', { title: 'Simulated latency' },
    ...[0, 250, 600].map((ms) => el('option', { value: ms, selected: store.getDev().latency === ms || false }, `${ms}ms`)));
  lat.addEventListener('change', () => store.setDev({ latency: parseInt(lat.value, 10) }));
  bar.append(el('span', { class: 'grp' }, el('label', {}, 'Latency'), lat));

  // fail next
  const fail = mkBtn('Fail Next: ' + (store.getDev().failNext ? 'ON' : 'off'), () => {
    store.setDev({ failNext: !store.getDev().failNext });
  });
  if (store.getDev().failNext) fail.classList.add('armed');
  bar.append(fail);

  bar.append(sep());

  // frontier toggle + SW unregister
  const fr = mkBtn('Frontiers: ' + (store.getDev().frontiers ? 'shown' : 'hidden'), () => store.setDev({ frontiers: !store.getDev().frontiers }));
  bar.append(fr);
  bar.append(mkBtn('SW unregister', unregisterSW));

  bar.append(sep());

  // Meta: what every control above does, and when to use it.
  const about = el('a', { class: 'about', href: '#/about', title: 'What do these controls do?' }, '? About this demo');
  bar.append(about);

  return bar;
}

function sep() { return el('span', { class: 'sep' }); }
function mkBtn(label, fn) { const b = el('button', {}, label); b.addEventListener('click', fn); return b; }

function exportData() {
  const text = storage.exportJson();
  const blob = new Blob([text], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'forage-export.json' });
  document.body.append(a); a.click(); a.remove();
  toast('Exported forage-export.json', 'ok');
}

function importData() {
  const input = el('input', { type: 'file', accept: 'application/json', class: 'hidden' });
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const data = storage.importJson(await file.text());
      store.loadEvents(data.events);
      toast('Imported.', 'ok');
    } catch (e) { toast('Import failed: ' + e.message, 'err'); }
  });
  document.body.append(input); input.click(); input.remove();
}

async function unregisterSW() {
  if (!('serviceWorker' in navigator)) return toast('No service worker support.', '');
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  toast(`Unregistered ${regs.length} worker(s). Reload to go network-only.`, 'ok');
}
