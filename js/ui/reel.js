// The reel — a board shown one post per screen (plan 2026-09-14-plan-clips,
// Phase 2). Clip mode frames the board's videos, gram mode its picture posts;
// js/view-mode.js says which posts those are, this file only lays them out.
//
// WHAT A FRAME IS. The post's media, at screen height, with the post's own
// ROW under it — byline, words, the like / reply / repost / share row, the ⋯
// menu — exactly the row the forum shows, compact. That is deliberate: the
// reel adds no action of its own, so nothing about what a reader can do to a
// post changes with how the board is shown, and the writes table in AGENTS.md
// is untouched.
//
// WHAT THE REEL PROMISES. One control to leave (the exit, named for where it
// goes — Forum — because the reel swallows the board chrome and the nav is a
// drawer on a phone, D7). A count line that says how many of the LOADED posts
// are frames, the same honesty as a window sort. An observer that marks the
// frame on screen active and rests the others; what "active" does (play a
// clip, or nothing) is the caller's, through the injected observe(), and the
// browser tier holds it (e2e/view-modes.workflow.mjs). Nothing here fetches:
// the media node is the row's own (a poster and a press for a clip, a stage or
// a carousel for pictures), so a frame costs exactly what its row costs.
//
// Pure over an injected el() so the structure is unit-testable (test/reel.test.js);
// the paint, the snap and the intersection are the browser's.
import { ofKind, modeFor } from '../view-mode.js';

const setAttr = (node, k, v) => {
  if (typeof node.setAttribute === 'function') node.setAttribute(k, v);
  else if (node.attrs) node.attrs[k] = v; // the unit tests' el()
};

// The default observer: the frame most on screen is the active one. A browser
// without IntersectionObserver (or a unit test) gets the first frame active.
export function viewportObserver(items, onActive) {
  if (typeof IntersectionObserver === 'undefined') { if (items[0]) onActive(items[0]); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (best) onActive(best.target);
  }, { threshold: [0.6] });
  for (const it of items) io.observe(it);
  return () => io.disconnect();
}

const noun = (mode, n) => (mode === 'clip' ? (n === 1 ? 'clip' : 'clips') : (n === 1 ? 'picture post' : 'picture posts'));

// `activate(post, item)` runs when a frame becomes the one on screen and
// `rest(post, item)` when it stops being — the caller decides what that means
// (mount a muted player, pause one). `origin` names where the frames came from
// when the board did not supply them itself (a people-scope reel: "from 701
// people you follow"), so D1's difference from rows is visible on the surface.
export function reel({ el, posts, mode, media, row, onExit, observe = viewportObserver, activate = null, rest = null, origin = null }) {
  const m = modeFor(mode);
  if (!m || mode === 'forum') throw new Error(`reel: ${mode} is not a reel mode`);
  const frames = ofKind(posts, mode);

  const exit = el('button', {
    type: 'button', class: 'btn sm reel-exit', 'data-reel-exit': 'forum',
    title: 'Back to the rows', onclick: () => onExit(),
  }, '☰ Forum');
  const loaded = `${posts.length} loaded post${posts.length === 1 ? '' : 's'}`;
  const count = el('span', { class: 'xs reel-count' },
    origin ? `${frames.length} ${noun(mode, frames.length)} ${origin} · ${loaded}`
      : `${frames.length} ${noun(mode, frames.length)} of ${loaded}`);
  const bar = el('div', { class: 'reel-bar' }, count, exit);

  if (!frames.length) {
    return el('div', { class: 'reel', 'data-reel': mode }, bar,
      el('div', { class: 'reel-empty muted' },
        mode === 'clip' ? 'No clips in the loaded posts.' : 'No picture posts in the loaded posts.',
        ' Load More below, widen your ring, or go back to the rows.'));
  }

  const items = frames.map((p) => el('section', { class: 'reel-item', 'data-post': p.id, 'data-active': '0' },
    el('div', { class: 'reel-stage' }, media(p)),
    el('div', { class: 'reel-row' }, row(p))));

  const node = el('div', { class: 'reel', 'data-reel': mode }, bar, ...items);
  const postOf = new Map(items.map((it, i) => [it, frames[i]]));
  let current = null;
  const stop = observe(items, (active) => {
    if (active === current) return;
    // An observer's queued entry can land after the reel was replaced (the
    // session landing repaints the board under it): a frame that is no longer
    // on the page cannot be active, and activating it mounted a player nobody
    // could see (journey, 2026-09-21: two playlists loaded for one frame).
    if (active && active.isConnected === false) return;
    for (const it of items) setAttr(it, 'data-active', it === active ? '1' : '0');
    if (current && rest) rest(postOf.get(current), current);
    current = active;
    if (active && activate) activate(postOf.get(active), active);
  });
  node._cleanup = stop;
  return node;
}
