// 3n: clean-path routing (owner decision 2026-08-26). URLs are real paths —
// forage.fyi/h/gardening, not forage.fyi/#/h/gardening — because a hashtag's
// identity IS the literal string and these links get shared. GitHub Pages has
// no rewrites, so 404.html serves the same shell (and the service worker turns
// deep links into 200s once installed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathOf, legacyHashPath, route, dispatch, setNotFound, parseQuery } from '../js/router.js';

const loc = (pathname, search = '', hash = '') => ({ pathname, search, hash });

test('pathOf reads the real path and query; the root normalizes to /', () => {
  assert.equal(pathOf(loc('/h/gardening')), '/h/gardening');
  assert.equal(pathOf(loc('/f/whats-hot', '?sort=new')), '/f/whats-hot?sort=new');
  assert.equal(pathOf(loc('/')), '/');
  assert.equal(pathOf(loc('')), '/');
  // a trailing slash is the same place
  assert.equal(pathOf(loc('/feeds/')), '/feeds/');
});

test('legacyHashPath bridges the OLD shared links (#/f/x) and refuses everything else', () => {
  // the deployed site shipped hash URLs — they must keep working
  assert.equal(legacyHashPath('#/f/whats-hot'), '/f/whats-hot');
  assert.equal(legacyHashPath('#/h/gardening'), '/h/gardening');
  assert.equal(legacyHashPath('#/p?uri=at%3A%2F%2Fx'), '/p?uri=at%3A%2F%2Fx');
  assert.equal(legacyHashPath('#/'), '/');
  // NOT a route: an OAuth fragment response (code+state) must never be
  // mistaken for a path — that would eat the callback
  assert.equal(legacyHashPath('#state=abc&code=xyz&iss=https%3A%2F%2Fbsky.social'), null);
  assert.equal(legacyHashPath('#access_token=x'), null);
  assert.equal(legacyHashPath(''), null);
  assert.equal(legacyHashPath('#'), null);
});

test('parseQuery splits a path from its query', () => {
  assert.deepEqual(parseQuery('/p?uri=at://x&from=y'), { path: '/p', query: { uri: 'at://x', from: 'y' } });
  assert.deepEqual(parseQuery('/feeds'), { path: '/feeds', query: {} });
});

test('dispatch matches clean paths, decodes params, and falls through to notFound', () => {
  const seen = [];
  route('/f/:slug', (p) => { seen.push(['feed', p.slug]); return 'feed'; });
  route('/u/:handle', (p) => { seen.push(['user', p.handle]); return 'user'; });
  setNotFound(() => 'missing');

  assert.equal(dispatch('/f/whats-hot'), 'feed');
  assert.deepEqual(seen.at(-1), ['feed', 'whats-hot']);
  // an encoded handle survives the round trip
  assert.equal(dispatch('/u/a%40b.test'), 'user');
  assert.deepEqual(seen.at(-1), ['user', 'a@b.test']);
  // a trailing slash still matches
  assert.equal(dispatch('/f/whats-hot/'), 'feed');
  assert.equal(dispatch('/nope'), 'missing');
});
