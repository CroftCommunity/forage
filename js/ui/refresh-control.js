// The refresh indicator and button (plan 2026-09-01-plan-feed-position-and-updates,
// D9). The owner, 2026-09-01: "put a refresh indicator and button to refresh on
// the top of the post feed stack, on the same horizontal line as the sort
// control bar, right aligned over the feed column."
//
// ONE control with three states rather than an indicator beside a button: a
// count with nothing to press is a dead end, and a button that cannot say
// whether pressing it will do anything makes the reader press it to find out.
//
//   rest  ⟳            nothing newer than what you are reading
//   news  ⟳ 3 new      three posts arrived; press to take them
//   busy  ⟳ (spinning) fetching
//
// It never injects. D6: restoring is automatic, refreshing is a press — the
// pattern Twitter and Instagram both arrived at after shipping the alternative
// and hearing about it. The count is in a live region beside the button, so the
// change is heard and not only seen.
import { el } from '../util.js';

// The bar scrolls away at scrollY ~256 (desktop) / ~274 (phone) — measured
// 2026-09-01, and it is `position: static` by design (a sticky bar costs 56px
// on top of the masthead's 61, which is 14% of an 844px phone spent on chrome
// that is idle almost always). So a PENDING count follows the reader down as a
// pill and stands down the moment the bar is back in view: one voice at a time,
// and nothing at all when there is nothing to say. D14 option (b).
export function refreshControl({ onRefresh, label = 'Refresh' }) {
  const glyph = el('span', { class: 'refresh-glyph', 'aria-hidden': 'true' }, '↻');
  const words = el('span', { class: 'refresh-words' }, '');
  const btn = el('button', { type: 'button', class: 'pillbtn refresh', 'data-refresh': '1',
    'data-state': 'rest', title: label, 'aria-label': label }, glyph, words);
  // Announced, not merely painted. Separate from the button's own label because
  // a screen reader re-reads a changed label only when focus is on it, and the
  // reader whose feed just grew is somewhere down the board.
  const live = el('span', { class: 'sr-only', 'data-refresh-live': '1', 'aria-live': 'polite' }, '');

  const pill = el('button', { type: 'button', class: 'newspill', 'data-newspill': '1' }, '');
  let count = 0;
  let barVisible = true;

  const paintPill = () => {
    const wanted = count > 0 && !barVisible;
    if (wanted) {
      pill.textContent = `↑ ${count} new post${count === 1 ? '' : 's'}`;
      if (!pill.isConnected) document.body.append(pill);
    } else if (pill.isConnected) pill.remove();
  };

  const setState = (state, n = 0) => {
    count = state === 'news' ? n : 0;
    btn.dataset.state = state;
    btn.disabled = state === 'busy';
    words.textContent = state === 'news' ? `${n} new` : '';
    const said = state === 'busy' ? 'Refreshing'
      : state === 'news' ? `${n} new post${n === 1 ? '' : 's'} — press to show ${n === 1 ? 'it' : 'them'}`
      : label;
    btn.setAttribute('aria-label', said);
    btn.title = said;
    live.textContent = state === 'news' ? `${n} new post${n === 1 ? '' : 's'}` : '';
    paintPill();
  };

  btn.addEventListener('click', () => onRefresh());
  pill.addEventListener('click', () => onRefresh());

  // The bar's own visibility drives the pill. An observer rather than a scroll
  // listener: it reports the state we actually care about (is the control on
  // screen) instead of a number we would have to convert into that state, and
  // it costs nothing while the reader sits still.
  const watch = () => {
    const io = new IntersectionObserver((entries) => {
      barVisible = entries[0].isIntersecting;
      paintPill();
    }, { threshold: 0 });
    io.observe(btn);
    return () => { io.disconnect(); pill.remove(); };
  };

  return { node: btn, live, setState, watch };
}
