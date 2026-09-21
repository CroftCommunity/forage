// The reel (plan 2026-09-14-plan-clips, Phase 2): a board shown one post per
// screen in clip or gram mode. Pure over an injected el() and an injected
// observer, so the STRUCTURE is unit-tested here and the paint, the snap and
// the intersection are the browser tier's job (e2e/view-modes.workflow.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reel } from '../js/ui/reel.js';

const fakeEl = (tag, attrs = {}, ...kids) => ({ tag, attrs, kids: kids.flat().filter((k) => k != null && k !== false) });
const walk = (n, out = []) => { if (n && n.tag) { out.push(n); (n.kids || []).forEach((k) => walk(k, out)); } return out; };
const byClass = (n, c) => walk(n).filter((x) => String(x.attrs.class || '').split(/\s+/).includes(c));

const posts = [
  { id: 'v1', author: 'a.test', media: { kind: 'video' } },
  { id: 'p1', author: 'b.test', media: { kind: 'images', items: [{}, {}] } },
  { id: 't1', author: 'c.test' },
  { id: 'v2', author: 'd.test', media: { kind: 'video' } },
];
const deps = () => ({
  el: fakeEl,
  media: (p) => fakeEl('div', { class: 'media-of', 'data-post': p.id }),
  row: (p) => fakeEl('div', { class: 'row-of', 'data-post': p.id }),
  observe: () => () => {},
  onExit() {},
});

test('clip mode: one frame per clip, in the board order, each with its media and its row', () => {
  const node = reel({ ...deps(), posts, mode: 'clip' });
  assert.equal(node.attrs['data-reel'], 'clip');
  const items = byClass(node, 'reel-item');
  assert.deepEqual(items.map((i) => i.attrs['data-post']), ['v1', 'v2']);
  for (const it of items) {
    assert.equal(byClass(it, 'media-of').length, 1, 'the media node is the frame');
    assert.equal(byClass(it, 'row-of').length, 1, 'the row (byline, words, actions) rides under it');
  }
});

test('gram mode: the picture posts only', () => {
  const node = reel({ ...deps(), posts, mode: 'gram' });
  assert.deepEqual(byClass(node, 'reel-item').map((i) => i.attrs['data-post']), ['p1']);
});

test('the exit is one control, named for where it goes, and it is the caller\'s to act on', () => {
  let left = 0;
  const node = reel({ ...deps(), posts, mode: 'clip', onExit: () => { left += 1; } });
  const exits = byClass(node, 'reel-exit');
  assert.equal(exits.length, 1);
  assert.equal(exits[0].attrs['data-reel-exit'], 'forum');
  assert.match(String(exits[0].kids.join('')), /Forum/);
  exits[0].attrs.onclick();
  assert.equal(left, 1);
});

test('a board with none of the kind says so in words and still offers the way back', () => {
  const node = reel({ ...deps(), posts: [posts[2]], mode: 'clip' });
  assert.equal(byClass(node, 'reel-item').length, 0);
  const empty = byClass(node, 'reel-empty');
  assert.equal(empty.length, 1);
  assert.match(String(empty[0].kids.join(' ')), /no clips/i);
  assert.equal(byClass(node, 'reel-exit').length, 1);
});

test('the count line says how many of the loaded posts are frames', () => {
  const node = reel({ ...deps(), posts, mode: 'clip' });
  const count = byClass(node, 'reel-count');
  assert.equal(count.length, 1);
  assert.match(String(count[0].kids.join(' ')), /2 clips? (in|of) 4 loaded posts/i);
});

test('the observer is handed every frame once, and its callback marks exactly one active', () => {
  let handed = null; let cb = null;
  const observe = (items, onActive) => { handed = items; cb = onActive; return () => {}; };
  const node = reel({ ...deps(), posts, mode: 'clip', observe });
  assert.equal(handed.length, 2);
  cb(handed[1]);
  const items = byClass(node, 'reel-item');
  assert.deepEqual(items.map((i) => i.attrs['data-active'] || '0'), ['0', '1']);
  cb(handed[0]);
  assert.deepEqual(items.map((i) => i.attrs['data-active'] || '0'), ['1', '0']);
});

test('the active frame is handed to activate() with its post, and the one it replaced to rest()', () => {
  let cb = null;
  const observe = (items, onActive) => { cb = onActive; return () => {}; };
  const seen = [];
  const node = reel({ ...deps(), posts, mode: 'clip', observe,
    activate: (p, item) => seen.push(['on', p.id, item.attrs['data-post']]),
    rest: (p, item) => seen.push(['off', p.id, item.attrs['data-post']]) });
  const items = byClass(node, 'reel-item');
  cb(items[0]);
  cb(items[1]);
  assert.deepEqual(seen, [['on', 'v1', 'v1'], ['off', 'v1', 'v1'], ['on', 'v2', 'v2']]);
});

test('the count line names where the frames came from when the caller says (a people-scope reel)', () => {
  const node = reel({ ...deps(), posts, mode: 'clip', origin: 'from 12 people you follow' });
  assert.match(String(byClass(node, 'reel-count')[0].kids.join(' ')), /2 clips from 12 people you follow · 4 loaded/);
});

test('an unknown mode refuses by name', () => {
  assert.throws(() => reel({ ...deps(), posts, mode: 'shorts' }), /shorts/);
});
