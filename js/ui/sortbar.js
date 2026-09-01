// The sort bar (plan 2026-08-29 post-and-thread, decision 9): ONE control bar
// on boards and threads — `Sort` and `From` selects dressed as pills — in place
// of tabs. Every sort on every board whatever its age (Reddit withholds; we
// don't). `From` is a filter over the loaded window by each item's own
// timestamp, offered only for the sorts that have a window (hot, top).
import { el } from '../util.js';

export const TIMEFRAMES = Object.freeze([
  ['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time'],
]);

// v11 (owner, 2026-09-01: "does 'top' month, year and all time really do
// anything?"). Whether they do depends on what the board's window IS, and until
// now the menu said the same thing whatever the answer:
//
//   a SERVER window (/h/ hashtag boards) — searchPosts takes sort plus
//     since/until, so every rung is a real query over the whole corpus and all
//     five mean five different things. TIMEFRAMES.
//   a WALK (/f/ feed boards) — a generator publishes no window lever at all
//     (DL-032), so the board widens by paging backwards on a budget: 8 pages of
//     30. Measured against the live Discover feed 2026-09-01, that reaches
//     29.4 hours. Driving the real toolbar against a feed of that shape, "this
//     week", "this month" and "this year" returned a byte-identical ranking of
//     the same 240 posts — three names for one answer — and "All time" ranked
//     FEWER than any of them, because it was the one rung that skipped the walk.
//
// So a walking board offers the rungs its walk can be told apart by, and "All
// time" becomes the WIDEST walk instead of the absent one. What that costs is
// worth writing down: on a SLOW feed, where 240 posts span months, "this month"
// and "this year" would have ranked genuinely different sets. All time now
// ranks everything the walk can reach, which covers the wider of the two; the
// narrower rung is the one deliberately given up, on the grounds that no reader
// can tell which kind of feed they are on before they choose.
export const WALK_TIMEFRAMES = Object.freeze(TIMEFRAMES.filter(([v]) => ['day', 'week', 'all'].includes(v)));

// A board's From choice outlives the board — it is view state, and the reader
// carries it from /h/ to /f/. When the board they land on does not offer it,
// the choice WIDENS to the next rung that board has, and never narrows: a
// select reading "This month" over a board that had quietly answered "this
// week" is the failure that is impossible to notice.
export function nearestTimeframe(from, timeframes = TIMEFRAMES) {
  const offered = timeframes.map(([v]) => v);
  if (offered.includes(from)) return from;
  const order = TIMEFRAMES.map(([v]) => v);
  const wanted = order.indexOf(from);
  return (wanted === -1 ? null : offered.find((v) => order.indexOf(v) > wanted)) ?? offered.at(-1);
}

// sorts: [[value, label]…]; sort/from: current values; windowed: sorts that
// take a From; onChange({ sort, from }) fires on either select. `extra` nodes
// (a count, a density dial) sit at the bar's right edge.
export function sortBar({ sorts, sort, from = 'all', windowed = ['hot', 'top'], timeframes = TIMEFRAMES, onChange, extra = [] }) {
  const sortSel = el('select', { class: 'pillsel', 'data-sort': '1', 'aria-label': 'Sort' },
    ...sorts.map(([v, l]) => el('option', { value: v, selected: v === sort || false }, l)));
  const fromSel = windowed.includes(sort)
    ? el('select', { class: 'pillsel', 'data-from': '1', 'aria-label': 'From' },
      ...timeframes.map(([v, l]) => el('option', { value: v, selected: v === from || false }, l)))
    : null;
  sortSel.addEventListener('change', () => onChange({ sort: sortSel.value, from }));
  fromSel?.addEventListener('change', () => onChange({ sort, from: fromSel.value }));
  return el('div', { class: 'sortbar' }, sortSel, fromSel, ...extra.filter(Boolean));
}
