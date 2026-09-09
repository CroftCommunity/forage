// Phase 0 of plans/2026-09-08-plan-mixes.md — MEASURE the fan-out a Home mix
// would pay, before deciding whether it needs a bound (decision D6). LIVE=1.
//
// A mix opens one request per enabled source, in parallel. The number this
// plan cannot reason its way to is what that costs on a real account against
// the real AppView: wall time for the slowest source, per-source spread, and
// whether anything times out. So: sign in as the standing test account, fan out
// over the Following timeline, N popular feed generators (found live, so the
// list is never stale), and two hashtags, and time every source. Three runs at
// the owner's rough source count (12), one at roughly double (25) to see the
// shape of the curve. Read-only; it never writes.
//
// It drives the lens's own doors (feed(), stream()) rather than raw XRPC, so
// what is timed includes shaping — the cost the reader actually waits for.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLens } from '../js/substrates/lens.js';
export const live = true;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDS = 'https://bsky.social';
const TEST_DID = 'did:plc:xyfhcaweaeyew3zrgk6jaln7';
const TIMEOUT_MS = 8000;
const TAGS = ['harvest', 'foraging'];

function creds() {
  const candidates = [join(root, '..', '.env'), join(root, '..', '..', '..', '.env')];
  const path = candidates.find((p) => { try { readFileSync(p); return true; } catch { return false; } });
  assert.ok(path, 'CroftC/.env not found beside this checkout — see CroftC/.claude/TESTBED.md');
  const env = Object.fromEntries(readFileSync(path, 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  assert.ok(env.test_user1 && env.test_pass1, 'CroftC/.env has no test_user1/test_pass1');
  return { identifier: env.test_user1, password: env.test_pass1 };
}
async function liveSession() {
  const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds()), signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  assert.ok(data.accessJwt, `createSession failed: ${res.status} ${data.error || ''}`);
  assert.equal(data.did, TEST_DID, `signed in as ${data.did}, not the registered test account`);
  return {
    did: data.did, handle: data.handle,
    fetchHandler: (path, init = {}) => fetch(`${PDS}${path}`, {
      ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${data.accessJwt}` },
      signal: AbortSignal.timeout(20000),
    }),
  };
}

const withTimeout = (p, ms) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms)),
]);

async function fanOut(lens, sources) {
  const t0 = performance.now();
  const rows = await Promise.all(sources.map(async (s) => {
    const start = performance.now();
    try {
      const r = s.kind === 'hashtag'
        ? await withTimeout(lens.stream({ kind: 'hashtag', key: s.tag, sort: 'new', timeframe: 'all', nowMs: Date.now() }), TIMEOUT_MS)
        : await withTimeout(lens.feed(s.source, { title: s.title }), TIMEOUT_MS);
      return { name: s.name, ms: Math.round(performance.now() - start), posts: r.posts.length, ok: true };
    } catch (e) {
      return { name: s.name, ms: Math.round(performance.now() - start), posts: 0, ok: false, err: e.message };
    }
  }));
  return { wallMs: Math.round(performance.now() - t0), rows };
}

const summarize = (label, { wallMs, rows }) => {
  const ok = rows.filter((r) => r.ok);
  const sorted = [...rows].sort((a, b) => a.ms - b.ms);
  const med = sorted[Math.floor(sorted.length / 2)].ms;
  const slowest = sorted.at(-1);
  console.log(`${label}: ${rows.length} sources · wall ${wallMs}ms · median ${med}ms · slowest ${slowest.name} ${slowest.ms}ms · failed ${rows.length - ok.length} · posts ${ok.reduce((n, r) => n + r.posts, 0)}`);
  for (const r of rows.filter((x) => !x.ok)) console.log(`    FAILED ${r.name}: ${r.err}`);
  return { wallMs, median: med, slowest: slowest.ms, failed: rows.length - ok.length };
};

export async function run() {
  const session = await liveSession();
  const lens = createLens({ session });
  await lens.loadPosture();
  // Popular generators, found live — never a stale hardcoded list.
  const r = await session.fetchHandler('/xrpc/app.bsky.unspecced.getPopularFeedGenerators?limit=30');
  assert.ok(r.ok, `getPopularFeedGenerators ${r.status}`);
  const gens = (await r.json()).feeds.map((f) => ({ kind: 'feed', name: f.displayName, title: f.displayName, source: { kind: 'feed', uri: f.uri } }));
  assert.ok(gens.length >= 22, `only ${gens.length} popular generators — need 22 for the N=25 run`);
  const timeline = { kind: 'timeline', name: 'Following', title: 'Following', source: { kind: 'timeline' } };
  const tags = TAGS.map((t) => ({ kind: 'hashtag', name: `#${t}`, tag: t }));
  const twelve = [timeline, ...gens.slice(0, 9), ...tags];
  const twentyFive = [timeline, ...gens.slice(0, 22), ...tags];

  const results = [];
  for (let i = 1; i <= 3; i++) results.push(summarize(`N=12 run ${i}`, await fanOut(lens, twelve)));
  results.push(summarize('N=25 run 1', await fanOut(lens, twentyFive)));
  // Sequential baseline for one run: what a reader would wait without the fan-out.
  const seqStart = performance.now();
  for (const s of twelve) { try { await fanOut(lens, [s]); } catch { /* counted above */ } }
  console.log(`N=12 sequential (for contrast): ${Math.round(performance.now() - seqStart)}ms`);
  assert.ok(results.every((x) => x.failed < 12), 'the fan-out answered at all');
}
