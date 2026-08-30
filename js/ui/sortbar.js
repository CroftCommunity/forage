// The sort bar (plan 2026-08-29 post-and-thread, decision 9): ONE control bar
// on boards and threads — `Sort` and `From` selects dressed as pills — in place
// of tabs. Every sort on every board whatever its age (Reddit withholds; we
// don't). `From` is a filter over the loaded window by each item's own
// timestamp, offered only for the sorts that have a window (hot, top).
import { el } from '../util.js';

export const TIMEFRAMES = Object.freeze([
  ['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time'],
]);

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
