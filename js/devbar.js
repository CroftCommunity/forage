// Dev bar (spec §9). Persona switch re-derives all viewer-dependent views in one
// place (the store notify). Dashed background marks it as scaffolding, not chrome.

import * as store from './store.js';
import * as storage from './storage.js';
import { PERSONAS } from './personas.js';
import { buildSeed } from '../data/seed.js';
import { el } from './util.js';
import * as skins from './skins.js';
import { toast } from './ui/components.js';

export function devBar() {
  const bar = el('div', { class: 'devbar' });
  const inMemory = store.activeMode() === 'memory';

  // Mode control (1c). SCAFFOLDING MIRROR: the canonical mode preference
  // lands in Settings at 3d; this select mirrors it for dev work. "Bluesky
  // view" is deliberately NOT in the select — it is a view (a route), not a
  // store mode; the link makes that distinction visible.
  const mode = el('select', { title: 'Store mode (memory = local sandbox; bbs = RAM-only network mode)' },
    ...['memory', 'bbs'].map((m) => el('option', { value: m, selected: store.activeMode() === m || false }, m)));
  mode.addEventListener('change', () => {
    try {
      if (mode.value === 'memory') { store.exitMode(); skins.clearTransient(); }
      else {
        store.enterMode(mode.value);
        // the BBS mode DEFAULTS to its skin; an explicit user choice wins
        if (mode.value === 'bbs' && skins.SKINS.bbs) skins.setTransient('bbs');
      }
      toast(`Mode: ${store.activeMode()}${store.activeMode() === 'memory' ? '' : ' (RAM only — nothing persists)'}`, 'ok');
    } catch (e) { toast(e.message, 'err'); mode.value = store.activeMode(); }
  });
  const modeGrp = el('span', { class: 'grp' }, el('label', {}, 'Mode'), mode);
  if (!inMemory) modeGrp.append(el('span', { class: 'tag' }, `${store.activeMode()} · RAM only`));
  modeGrp.append(el('a', { href: '#/lens', class: 'small', title: 'A view of the live network — not a store mode' }, 'Bluesky view'));
  bar.append(modeGrp);

  bar.append(sep());

  // persona dropdown — pinned while a network mode is active (the signed-in
  // identity owns network modes; personas are a memory-tier concept)
  const sel = el('select', { title: inMemory ? 'Active persona' : 'Persona is pinned outside memory mode' },
    ...PERSONAS.map((p) => el('option', { value: p.id === null ? '' : p.id, selected: p.id === store.getPersonaId() || false }, p.label)));
  // include any runtime-created accounts not in the static roster
  for (const u of Object.values(store.getState().users)) {
    if (!PERSONAS.some((p) => p.id === u.id)) sel.append(el('option', { value: u.id, selected: u.id === store.getPersonaId() || false }, u.handle + ' (new)'));
  }
  sel.addEventListener('change', () => store.setPersona(sel.value === '' ? null : sel.value));
  if (!inMemory) sel.disabled = true;
  bar.append(el('span', { class: 'grp' }, el('label', {}, 'Persona'), sel));

  bar.append(sep());

  // seed / delete / export / import — the mutating trio is gated outside
  // memory mode (1b protects the KEY structurally; this protects the RAM
  // dataset from a stray seed while camping)
  const gate = (btn) => {
    if (!inMemory) { btn.disabled = true; btn.title = 'Disabled outside memory mode'; }
    return btn;
  };
  bar.append(el('span', { class: 'grp' },
    gate(mkBtn('Seed', () => { store.loadEvents(buildSeed()); toast('Seeded (scenario library replay).', 'ok'); })),
    gate(mkBtn('Delete All', () => { if (confirm('Delete all local data?')) { store.reset(); toast('Cleared.', ''); } })),
    mkBtn('Export', exportData),
    gate(mkBtn('Import', importData))));

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
