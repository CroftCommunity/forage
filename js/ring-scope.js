// The reader's ring — which stops the pill offers, which one is selected, and
// whether feeds and hashtags are exempt from it.
//
// One module, read by everything, on the same tenet as js/board-density.js: a
// second file reaching for the raw key is how two surfaces start disagreeing
// about one preference. The pill in the masthead, the pill at the top of a
// thread and the Advanced settings on /me are three views of what is here.
//
// Device-local, like skin and density — never forage.state. Your ring is a
// property of how you are reading right now, not of your account.
//
// WHAT THIS MODULE IS DEFENDING AGAINST. The stops are the reader's to compose
// (owner, 2026-09-03: "users can remove or add entries on the slider"), and a
// composable list can be wrong in ways the frozen ladder could not be. Every
// read below is therefore a REPAIR, not a parse: a stop list stored in an order
// that inverts containment is re-sorted, one naming a retired scope is trimmed,
// one that ends up empty falls back. None of those throw, because this list is
// read on every render and taking the control away over a bookkeeping problem
// is a worse answer than showing the stops that still make sense.
//
// Writes are the opposite and refuse by name. Storage can be stale through no
// fault of the caller; a caller asking to select a scope that is not on the pill
// is a bug in the caller.

import { byRank, RUNG_IDS, scopeFor } from './rings.js';

export const STOPS_KEY = 'forage.ringstops';
export const SCOPE_KEY = 'forage.ringscope';
export const EXEMPT_KEY = 'forage.ringexempt';

// Decision 1 (owner, 2026-09-03): Mutuals | Follows | World. Mutuals are a
// SUBSET of follows, so these three are a real containment chain. `hop` — your
// follows plus everyone your mutuals follow — stays in the registry rather than
// on the pill: it is the one scope whose cost scales with your mutual count,
// and a reader who wants it adds it, which is what composability is for.
export const DEFAULT_STOPS = Object.freeze(['mut', 'fol', 'world']);

// World is the default selection for two reasons that agree: it is what the app
// does today (`activeRing = 'world'`), so nobody's reading changes on upgrade,
// and it is the only scope that costs no graph reads, so the walk is paid by
// the readers who asked for it.
export const DEFAULT_SCOPE = 'world';

// The board kinds the exemption covers. `feedKind` rides the source through
// shapeLensPost (js/substrates/lens.js), which is what makes this one set
// lookup rather than a special case per surface.
export const EXEMPT_KINDS = Object.freeze(['feed', 'hashtag']);

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } };

// World is pinned into every stop list (owner, 2026-09-03: "fine on pinning
// world"). It is not a stop like the others — it is the ring declining to narrow
// (`members === null`), which makes it the pill's off position. Off for the
// RING only: blocks, mutes and label prefs are untouched by where this pill
// sits, and a reader at World is still moderated. A pill whose every segment filters cannot answer "what am I not
// seeing?", which is the question a ring most needs to be able to answer, and a
// reader who removed World would have no way back to it from the control itself.
const withWorld = (ids) => byRank([...ids, 'world']);

export function stops() {
  const raw = read(STOPS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const kept = byRank(parsed.filter((id) => RUNG_IDS.includes(id)));
        if (kept.length) return withWorld(kept);
      }
    } catch { /* corrupt: fall through to the default */ }
  }
  return withWorld(DEFAULT_STOPS);
}

export function setStops(ids) {
  write(STOPS_KEY, JSON.stringify(withWorld(byRank(ids || []))));
  notify();
}

export function addStop(id) { setStops([...stops(), id]); }

export function removeStop(id) {
  // Removing World is a no-op rather than an error: it is a reasonable thing to
  // ask for and an unreasonable thing to grant, and refusing loudly would make
  // a settings checkbox throw.
  if (id === 'world') return;
  setStops(stops().filter((s) => s !== id));
}

export function scope() {
  const open = stops();
  const stored = read(SCOPE_KEY);
  if (stored && open.includes(stored)) return stored;
  // The stored scope is not on the pill — the reader removed it, or it was
  // retired. Filtering by a scope with no segment is a state they cannot
  // observe and cannot leave, so fall to the WIDEST stop: the one that hides
  // the least. `stops()` is rank-ascending, so that is the last one.
  return open.at(-1);
}

export function setScope(id) {
  const open = stops();
  if (!open.includes(id)) {
    throw new Error(`ring: ${id} is not a stop on this pill (stops: ${open.join(', ')})`);
  }
  write(SCOPE_KEY, id);
  notify();
}

// The thread pill (owner, 2026-09-03: "just overrides the thread"). The override
// is an ARGUMENT, never a write, and that is the whole of what makes it
// transient — leaving the thread drops it and the site-wide scope is what
// remains. An override naming something that is not a stop is ignored for the
// same reason `scope()` falls back rather than throwing.
export function effectiveScope(override) {
  if (override && stops().includes(override)) return override;
  return scope();
}

// Checked = exempt = unfiltered, which is the default. A feed or a hashtag is
// something the reader went and asked for by name; scoping it silently would
// make a deliberate request quietly return less than the rest of the app.
// Wanting the opposite is legitimate — an empty feed is then the setting
// working — but it is a choice you make, not one you inherit.
export function exemptsFeeds() { return read(EXEMPT_KEY) !== '0'; }

export function setExemptsFeeds(on) { write(EXEMPT_KEY, on ? '1' : '0'); notify(); }

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// One payload for all three settings: a listener that repaints on a scope change
// repaints on a stop change too, and the pill needs both anyway.
function notify() {
  const state = { scope: scope(), stops: stops(), exemptsFeeds: exemptsFeeds() };
  for (const fn of listeners) fn(state);
}

// ---- the control ----
//
// Built with an injected el(), the same way js/board-density.js builds its
// density dial, so this module still needs no DOM and stays unit-testable.
//
// NATIVE RADIOS, not buttons with role="radio". A radio group gives arrow-key
// navigation, roving focus and the "3 of 4" announcement for free, and every
// hand-rolled segmented control has to reimplement all three. The inputs are
// visually hidden and the LABELS are the segments, which is also what puts a
// 44px tap target under each one without a min-height on a <button> fighting
// its own line-height.
//
// The visible text is the SHORT label. "My follows, one hop out" beside three
// siblings does not fit a 390px phone; the long wording lives in the title and
// on the settings page, where there is room for it.
let pillSeq = 0;

export function ringPill(el, { override = null, onPicked, ariaLabel = 'How close' } = {}) {
  const open = stops();
  // A control with one value is not a control — it is a label that absorbs
  // clicks. World is pinned, so this is what a reader who removed everything
  // else gets, and rendering nothing is the honest answer.
  if (open.length < 2) return null;

  const current = effectiveScope(override);
  // Two pills can be on one page at once — the masthead and a thread header —
  // and radios sharing a `name` are ONE group, so the second would steer the
  // first. The sequence is what keeps them apart.
  const group = `ringpill-${++pillSeq}`;

  const segs = open.flatMap((id) => {
    const s = scopeFor(id);
    const inputId = `${group}-${id}`;
    return [
      el('input', {
        type: 'radio', name: group, id: inputId, class: 'ringpill-in',
        'data-scope': id, checked: id === current || false,
        onchange: () => onPicked(id),
      }),
      el('label', { class: 'ringseg', for: inputId, title: `${s.label} — ${s.blurb}` },
        el('span', { class: 'ico', 'aria-hidden': 'true' }, '◍'),
        el('span', { class: 'ringseg-t' }, s.pill)),
    ];
  });

  return el('div', {
    class: 'ringpill', 'data-ring-pill': '1', role: 'radiogroup', 'aria-label': ariaLabel,
  }, ...segs);
}
