// 2b: the OAuth session module (plan 2026-08-25-1). Hermetic: the vendored
// client is a PORT here — tests drive the state machine over a fake; the real
// client is exercised by the 2c live loopback validation. The metadata
// document is pinned field-by-field (the auth server fetches it verbatim;
// drift = every sign-in breaks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authModeFor, buildLoopbackClientId, OAUTH_SCOPE, PRODUCTION_ORIGIN,
  createSessionManager,
} from '../js/auth/session.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('client-metadata.json is pinned: id/redirect/scope/dpop, arecipe-shaped', () => {
  const m = JSON.parse(readFileSync(join(root, 'client-metadata.json'), 'utf8'));
  assert.equal(m.client_id, 'https://forage.fyi/client-metadata.json');
  assert.deepEqual(m.redirect_uris, ['https://forage.fyi/']);
  assert.equal(m.scope, 'atproto transition:generic');
  assert.equal(m.dpop_bound_access_tokens, true);
  assert.equal(m.token_endpoint_auth_method, 'none');
  assert.deepEqual(m.grant_types, ['authorization_code', 'refresh_token']);
  assert.deepEqual(m.response_types, ['code']);
});

test('authModeFor: loopback hosts, the production origin, read-only everywhere else', () => {
  assert.equal(authModeFor('http://127.0.0.1:8080', '127.0.0.1'), 'loopback');
  assert.equal(authModeFor('http://localhost:8080', 'localhost'), 'loopback');
  assert.equal(authModeFor(PRODUCTION_ORIGIN, 'forage.fyi'), 'hosted');
  assert.equal(authModeFor('https://example.com', 'example.com'), 'none');
});

test('the loopback client_id: IP-literal redirect, explicit scope, pathname-independent (D4 facts)', () => {
  const id = buildLoopbackClientId({ hostname: 'localhost', port: '8080', pathname: '/deep/page.html' });
  assert.ok(id.startsWith('http://localhost?'), id);
  assert.match(id, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A8080%2F/, 'localhost normalized to the IP literal');
  assert.ok(id.includes(encodeURIComponent(OAUTH_SCOPE)), 'scope is explicit — bare atproto cannot call appview RPCs');
  assert.ok(!id.includes('deep'), 'pathname never enters the client_id (arecipe refresh bug)');
  // portless origin
  const bare = buildLoopbackClientId({ hostname: '127.0.0.1', port: '', pathname: '/' });
  assert.match(bare, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%2F/);
});

function fakeClient({ initResult } = {}) {
  const calls = [];
  return {
    calls,
    init: async () => { calls.push('init'); return initResult; },
    signIn: async (handle) => { calls.push(`signIn:${handle}`); return new Promise(() => {}); },
  };
}
const fakeSession = (did) => ({
  did,
  signOut: async () => {},
  fetchHandler: async () => new Response('{}'),
  getTokenInfo: async () => ({ expiresAt: new Date(0) }),
});

test('state machine: signed-out → restore finds nothing', async () => {
  const mgr = createSessionManager({ client: fakeClient({ initResult: undefined }) });
  assert.equal(mgr.state(), 'unknown');
  const session = await mgr.restore();
  assert.equal(session, null);
  assert.equal(mgr.state(), 'signed-out');
  assert.equal(mgr.currentSession(), null);
});

test('state machine: restore lands signed-in; signOut returns to signed-out; events fire in order', async () => {
  const mgr = createSessionManager({ client: fakeClient({ initResult: { session: fakeSession('did:plc:abc') } }) });
  const seen = [];
  mgr.onChange((s) => seen.push(s));
  await mgr.restore();
  assert.equal(mgr.state(), 'signed-in');
  assert.equal(mgr.currentSession().did, 'did:plc:abc');
  assert.equal(typeof mgr.fetch, 'function', 'the DPoP-bound fetch is exposed for consumers');
  await mgr.signOut();
  assert.equal(mgr.state(), 'signed-out');
  assert.equal(mgr.currentSession(), null);
  assert.deepEqual(seen, ['signed-in', 'signed-out']);
});

test('state machine: signIn moves to pending (the redirect never resolves)', async () => {
  const mgr = createSessionManager({ client: fakeClient({ initResult: undefined }) });
  await mgr.restore();
  mgr.signIn('someone.bsky.social'); // deliberately not awaited — it redirects
  assert.equal(mgr.state(), 'pending');
});

test('refusals with words: fetch without a session; signOut when signed out is a no-op', async () => {
  const mgr = createSessionManager({ client: fakeClient({ initResult: undefined }) });
  await mgr.restore();
  await assert.rejects(() => mgr.fetch('/xrpc/x'), /signed out|no session/i);
  await mgr.signOut(); // no throw
  assert.equal(mgr.state(), 'signed-out');
});
