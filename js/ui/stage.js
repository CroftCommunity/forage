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
export function stage({ kind, thumb, alt = '', aspect = null, link, linkLabel = null, linkAttrs = {} }) {
  const fore = el('img', { class: 'stage-fore', src: thumb, alt, loading: 'lazy', decoding: 'async' });
  const attrs = { class: 'stage', 'data-stage': kind };
  if (aspect) attrs.style = `--aspect: ${aspect.w} / ${aspect.h}`;
  else attrs['data-aspect'] = 'none';
  const node = el('div', attrs,
    el('a', { class: 'stage-link', href: link, ...(linkLabel ? { 'aria-label': linkLabel } : {}), ...linkAttrs },
      // the backdrop is the picture again, blurred — decorative, so alt='' and
      // hidden from the tree; a video gets black bands instead (no blur layer)
      kind === 'video' ? null : el('img', { class: 'stage-back', src: thumb, alt: '', 'aria-hidden': 'true', loading: 'lazy', decoding: 'async' }),
      fore,
      kind === 'video' ? el('span', { class: 'stage-play', 'aria-hidden': 'true' }, '▶') : null));
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
