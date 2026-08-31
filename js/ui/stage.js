// The media stage (plan 2026-08-29-plan-board-cards, decision 4). A card-wide
// frame, height capped by the card size, the picture centred and contain-fit,
// a blurred copy of itself behind it; black bands for video. One rule for
// every shape — portrait, landscape, widescreen, a screenshot — so a board of
// pictures reads as a column of full frames instead of a tile of negative
// space around a 220px thumbnail (the owner's finding, forage.fyi 2026-08-29).
//
// The frame is sized BEFORE the picture loads, from the ratio the shaper
// carried (Phase 5a): `--aspect` on the stage drives `aspect-ratio` in CSS,
// and the cap clamps it. A picture with no ratio (old records) takes the cap
// as its height and sizes from the picture on load — the one case a board can
// jump, and the stage says so once per session so a report has its answer.
import { el } from '../util.js';

let saidSizedOnLoad = false;

// One picture on its stage. `link` is where the tap goes (full size, or bsky.app
// for a video), `linkLabel` the anchor's name when the picture has no alt.
// feed-row v13 decisions 29–30: `onPlay` makes the stage a PLAYER's poster —
// a button over the picture, no link out — and the caller swaps the player in
// (a <video> for a Bluesky clip, YouTube's embed for a YouTube link). Nothing
// is fetched from the video's host until the press.
export function stage({ kind, thumb, alt = '', aspect = null, link, linkLabel = null, linkAttrs = {}, onPlay = null, playLabel = 'Play' }) {
  const fore = el('img', { class: 'stage-fore', src: thumb, alt, loading: 'lazy', decoding: 'async' });
  const attrs = { class: 'stage', 'data-stage': kind };
  if (aspect) attrs.style = `--aspect: ${aspect.w} / ${aspect.h}`;
  else attrs['data-aspect'] = 'none';
  // the backdrop is the picture again, blurred — decorative, so alt='' and
  // hidden from the tree; a video gets black bands instead (no blur layer)
  const back = kind === 'video' ? null : el('img', { class: 'stage-back', src: thumb, alt: '', 'aria-hidden': 'true', loading: 'lazy', decoding: 'async' });
  const node = onPlay
    ? el('div', attrs, back, fore,
        el('button', { type: 'button', class: 'stage-play', 'data-play': '1', 'aria-label': playLabel }, el('span', { 'aria-hidden': 'true' }, '▶')))
    : el('div', attrs,
        el('a', { class: 'stage-link', href: link, ...(linkLabel ? { 'aria-label': linkLabel } : {}), ...linkAttrs },
          back, fore,
          kind === 'video' ? el('span', { class: 'stage-play', 'aria-hidden': 'true' }, '▶') : null));
  if (onPlay) node.querySelector('[data-play]').addEventListener('click', () => onPlay(node));
  if (!aspect) {
    fore.addEventListener('load', () => {
      if (!(fore.naturalWidth > 0 && fore.naturalHeight > 0)) return;
      node.style.setProperty('--aspect', `${fore.naturalWidth} / ${fore.naturalHeight}`);
      node.removeAttribute('data-aspect');
      if (!saidSizedOnLoad) { saidSizedOnLoad = true; console.debug('forage: stage sized from the picture — no aspect on the embed'); }
    }, { once: true });
  }
  return node;
}

// Phase 6 (decision 5). A carousel is ONE stage — card-wide, capped, framed by
// the first picture's ratio — whose slides each carry their own picture, alt
// and backdrop. Dots, edge arrows, ← → keys, and a swipe (pointer events: a
// finger and a mouse both send them) move it; a live region says "picture 2
// of 4" so a screen reader hears every move, while the visible n / m counter
// is decorative. The link on each slide still opens the picture; a swipe that
// travelled is not a click.
const SWIPE_PX = 40;
export function carousel({ items, linkAttrs = {} }) {
  const n = items.length;
  let at = 0;
  const first = items[0].aspect;
  const slides = items.map((i, idx) => el('div', { class: 'stage-slide', 'data-slide': String(idx + 1) },
    el('a', { class: 'stage-link', href: i.full, draggable: 'false', ...(i.alt ? {} : { 'aria-label': 'Image, opens full size' }), ...linkAttrs },
      el('img', { class: 'stage-back', src: i.thumb, alt: '', 'aria-hidden': 'true', loading: 'lazy', decoding: 'async', draggable: 'false' }),
      el('img', { class: 'stage-fore', src: i.thumb, alt: i.alt, loading: 'lazy', decoding: 'async', draggable: 'false' }))));
  const track = el('div', { class: 'stage-track' }, ...slides);
  const dots = el('div', { class: 'dots' }, ...items.map((_, idx) =>
    el('button', { type: 'button', 'data-dot': String(idx + 1), 'aria-label': `Picture ${idx + 1}`, 'aria-current': idx === 0 ? 'true' : 'false' })));
  const counter = el('span', { class: 'stage-counter', 'aria-hidden': 'true' }, `1 / ${n}`);
  const live = el('span', { class: 'sr-only', 'aria-live': 'polite' }, `picture 1 of ${n}`);
  const prev = el('button', { type: 'button', class: 'stage-prev', 'aria-label': 'Previous picture' }, el('span', { 'aria-hidden': 'true' }, '\u2039'));
  const next = el('button', { type: 'button', class: 'stage-next', 'aria-label': 'Next picture' }, el('span', { 'aria-hidden': 'true' }, '\u203A'));
  const attrs = { class: 'stage carousel', 'data-stage': 'images', tabindex: '0', role: 'group',
    'aria-roledescription': 'carousel', 'aria-label': `${n} pictures` };
  if (first) attrs.style = `--aspect: ${first.w} / ${first.h}`; else attrs['data-aspect'] = 'none';
  const node = el('div', attrs, track, prev, next, dots, counter, live);
  const go = (idx) => {
    at = (idx + n) % n;
    track.style.transform = `translateX(-${at * 100}%)`;
    for (const d of dots.children) d.setAttribute('aria-current', String(Number(d.dataset.dot) === at + 1));
    counter.textContent = `${at + 1} / ${n}`;
    live.textContent = `picture ${at + 1} of ${n}`;
  };
  prev.addEventListener('click', () => go(at - 1));
  next.addEventListener('click', () => go(at + 1));
  dots.addEventListener('click', (e) => { const d = e.target.closest('[data-dot]'); if (d) go(Number(d.dataset.dot) - 1); });
  node.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  });
  // the swipe: horizontal travel past the threshold moves one slide, and the
  // click that would follow the release is swallowed so the link stays put
  let startX = null, travelled = false;
  track.addEventListener('pointerdown', (e) => { startX = e.clientX; travelled = false; });
  track.addEventListener('pointermove', (e) => { if (startX !== null && Math.abs(e.clientX - startX) > 10) travelled = true; });
  track.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX; startX = null;
    if (dx <= -SWIPE_PX) go(at + 1); else if (dx >= SWIPE_PX) go(at - 1);
  });
  track.addEventListener('pointercancel', () => { startX = null; });
  track.addEventListener('click', (e) => { if (travelled) { e.preventDefault(); travelled = false; } }, true);
  return node;
}

// Bluesky's grid: 2 side by side, 3 as one tall beside two stacked, 4 as two
// by two — cover-cropped cells, the whole grid capped like a stage. The
// pictures are all shown, so each keeps its alt and its link.
export function grid({ items, linkAttrs = {} }) {
  return el('div', { class: 'stage-grid', 'data-count': String(items.length) },
    ...items.map((i) => el('a', { class: 'stage-cell', href: i.full, ...(i.alt ? {} : { 'aria-label': 'Image, opens full size' }), ...linkAttrs },
      el('img', { class: 'stage-fore', src: i.thumb, alt: i.alt, loading: 'lazy', decoding: 'async' }))));
}
