// The harvest — plan 2026-09-08-plan-feed-index-and-jumpstarts, Phase 0.
//
//   node scripts/harvest-feeds.mjs                 # data/feed-providers.json + data/feed-queries.json
//                                                  #   → data/feed-index.json + data/feed-index-meta.json
//   node scripts/harvest-feeds.mjs --dry-run       # counts only, writes nothing
//   node scripts/harvest-feeds.mjs --providers my.json --out my-index.json
//                                                  # a community's own index from its own list (D-own)
//   --queries <file>  --meta <file>  --concurrency 6  --max-pack-pages 400  --max-query-pages 40
//
// Exit 0: written. Exit 2: the guard refused (a materially smaller corpus
// than the committed file, or under the absolute floors — VERIFICATION shape
// 3, a green run that graded an empty set) and NOTHING was written. Exit 1:
// an error. The workflow branches on this status; it is never piped.
//
// Node stdlib only: this is a script, like mock-snaps.mjs, and the shipped
// app's zero-dependency gate is untouched. The network is ONE function
// (`get`); every fold is in scripts/lib/harvest.mjs and tested hermetic.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { buildIndex, guard, serialize, FLOORS } from './lib/harvest.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const PROVIDERS = opt('--providers', 'data/feed-providers.json');
const QUERIES = opt('--queries', 'data/feed-queries.json');
const OUT = opt('--out', 'data/feed-index.json');
const META = opt('--meta', 'data/feed-index-meta.json');
const CONCURRENCY = Number(opt('--concurrency', 6));
const MAX_PACK_PAGES = Number(opt('--max-pack-pages', 400));
const MAX_QUERY_PAGES = Number(opt('--max-query-pages', 40));
const DRY = flag('--dry-run');

const API = 'https://public.api.bsky.app/xrpc/';
const UA = 'forage feed-index harvest (forage.fyi; chase@owasp.org)';
const stats = { requests: 0, retries: 0, t0: Date.now() };
const log = (s) => process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${s}\n`);

// The one network function. 429 and 5xx back off and retry; anything else is
// an error the caller sees. A page that will not load after four tries ends
// its walk with what it has — the guard decides whether that was enough.
async function get(method, params = {}) {
  const url = API + method + '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null));
  for (let attempt = 0; ; attempt++) {
    stats.requests++;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ctl.signal });
      if (r.ok) return await r.json();
      if ((r.status === 429 || r.status >= 500) && attempt < 4) {
        stats.retries++;
        const wait = r.status === 429 ? 15000 * (attempt + 1) : 2000 * (attempt + 1);
        log(`  ${r.status} on ${method} — waiting ${wait / 1000}s`);
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      throw new Error(`${method}: HTTP ${r.status}`);
    } catch (e) {
      // A dropped network (a laptop that slept mid-walk, 2026-09-08: 264
      // retries burned in seconds, the pack corpus truncated, the guard
      // refused) is waited out, not spun through: up to six tries, 5s→30s.
      if (attempt < 6 && (e.name === 'AbortError' || /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN/.test(e.message))) {
        stats.retries++;
        const wait = 5000 * (attempt + 1);
        log(`  network: ${e.name === 'AbortError' ? 'timeout' : e.message} on ${method} — waiting ${wait / 1000}s`);
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      throw e;
    } finally { clearTimeout(timer); }
  }
}

async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => {
    for (let x = q.shift(); x !== undefined; x = q.shift()) await fn(x);
  }));
}

// ---- feeds ----

async function walkGenerators(query, maxPages, into) {
  let cursor; let pages = 0; let added = 0;
  while (pages < maxPages) {
    const d = await get('app.bsky.unspecced.getPopularFeedGenerators', { limit: 100, query, cursor });
    pages++;
    for (const f of d.feeds || []) if (!into.has(f.uri)) { into.set(f.uri, f); added++; }
    cursor = d.cursor;
    if (!cursor || !(d.feeds || []).length) break;
  }
  return { pages, added };
}

async function hydrateFeeds(uris) {
  const out = [];
  const list = [...uris];
  for (let i = 0; i < list.length; i += 25) {
    const batch = list.slice(i, i + 25);
    const params = Object.fromEntries(batch.map((u, j) => [`feeds[${j}]`, u]));
    try { out.push(...((await get('app.bsky.feed.getFeedGenerators', params)).feeds || [])); }
    catch (e) { log(`  hydrate batch failed: ${e.message}`); }
  }
  return out;
}

// ---- packs ----

async function walkPacks(q, maxPages, into) {
  let cursor; let pages = 0;
  while (pages < maxPages) {
    let d;
    try { d = await get('app.bsky.graph.searchStarterPacksV2', { q, limit: 100, cursor }); }
    catch (e) { log(`  packs q=${q} page ${pages + 1}: ${e.message} — ending this walk`); break; }
    pages++;
    for (const p of d.starterPacks || []) into.set(p.uri, p);
    cursor = d.cursor;
    if (!cursor || !(d.starterPacks || []).length) break;
    if (pages % 50 === 0) log(`  packs q=${q}: page ${pages}, ${into.size} so far`);
  }
  return pages;
}

async function main() {
  const providersFile = JSON.parse(await readFile(PROVIDERS, 'utf8'));
  const queriesFile = JSON.parse(await readFile(QUERIES, 'utf8'));
  const providers = providersFile.providers || [];
  const pins = providersFile.pins || [];
  const feedQueries = queriesFile.feeds || [];
  const packQueries = queriesFile.jumpstarts || [];
  const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
  log(`harvest: ${providers.length} providers, ${pins.length} pins, ${feedQueries.length} feed queries, ${packQueries.length} jumpstart queries${prev ? `; committed index has ${prev.feeds.length} feeds, ${prev.jumpstarts.length} jumpstarts` : ''}`);

  // 1. the sweep (D1)
  const feeds = new Map();
  let done = 0;
  await pool(feedQueries, CONCURRENCY, async (q) => {
    const r = await walkGenerators(q, MAX_QUERY_PAGES, feeds);
    if (++done % 50 === 0) log(`  sweep ${done}/${feedQueries.length}: ${feeds.size} feeds (q=${q}: ${r.pages} pages, +${r.added})`);
  });
  log(`sweep: ${feeds.size} feeds from ${feedQueries.length} queries`);

  // 2. browse + suggested: the AppView's own curation, kept regardless of likes (D3)
  const keep = new Set();
  const browse = new Map();
  await walkGenerators(undefined, 5, browse);
  for (const [u, f] of browse) { keep.add(u); if (!feeds.has(u)) feeds.set(u, f); }
  try {
    const s = await get('app.bsky.unspecced.getSuggestedFeeds', { limit: 25 });
    for (const f of s.feeds || []) { keep.add(f.uri); if (!feeds.has(f.uri)) feeds.set(f.uri, f); }
  } catch (e) { log(`  suggested feeds unavailable: ${e.message}`); }
  log(`browse+suggested: ${keep.size} kept regardless of floor`);

  // 3. providers: every feed an account publishes (D3 — 1.51× what search knows)
  const accounts = providers.filter((p) => p.kind !== 'platform');
  let expanded = 0;
  await pool(accounts, CONCURRENCY, async (p) => {
    try {
      const { did } = await get('com.atproto.identity.resolveHandle', { handle: p.handle });
      let cursor; let pages = 0;
      while (pages < 3) {
        const d = await get('app.bsky.feed.getActorFeeds', { actor: did, limit: 100, cursor });
        pages++;
        for (const f of d.feeds || []) if (!feeds.has(f.uri)) { feeds.set(f.uri, f); expanded++; }
        cursor = d.cursor;
        if (!cursor) break;
      }
    } catch (e) { log(`  provider @${p.handle}: ${e.message}`); }
  });
  log(`providers: +${expanded} feeds from ${accounts.length} accounts`);

  // 4. pins: the feeds search cannot find (D3's 19) — hydrated, kept
  const hydrated = [];
  if (pins.length) {
    const got = await hydrateFeeds(pins);
    for (const f of got) { keep.add(f.uri); hydrated.push(f); }
    log(`pins: ${got.length}/${pins.length} hydrated`);
  }

  // 5. packs: the wildcard walk (popularity-weighted, rough — D6) plus themed queries
  const packs = new Map();
  const wild = await walkPacks('*', MAX_PACK_PAGES, packs);
  await pool(packQueries, CONCURRENCY, (q) => walkPacks(q, 12, packs));
  log(`packs: ${packs.size} from ${wild} wildcard pages + ${packQueries.length} queries`);

  // 6. the feeds only a pack leads to (D7): hydrate what the sweep never saw,
  //    for packs above the floor only
  const referenced = new Set();
  for (const p of packs.values()) {
    if ((p.joinedAllTimeCount ?? 0) < FLOORS.joins) continue;
    for (const f of p.feeds || []) if (f.uri && !feeds.has(f.uri)) referenced.add(f.uri);
  }
  if (referenced.size) {
    const got = await hydrateFeeds(referenced);
    hydrated.push(...got);
    log(`pack-referenced feeds: ${got.length}/${referenced.size} hydrated`);
  }

  // 7. the fold, the guard, the write
  const index = buildIndex({ feeds: [...feeds.values()], packs: [...packs.values()], keepFeeds: keep, hydrated, providers });
  const counts = { feeds: index.feeds.length, jumpstarts: index.jumpstarts.length, edges: index.edges.length, providers: index.providers.length };
  const seconds = Math.round((Date.now() - stats.t0) / 1000);
  log(`index: ${counts.feeds} feeds, ${counts.jumpstarts} jumpstarts, ${counts.edges} edges — ${stats.requests} requests (${stats.retries} retries), ${seconds}s`);

  const g = guard(prev ? { feeds: prev.feeds.length, jumpstarts: prev.jumpstarts.length } : null, counts);
  if (!g.ok) {
    log(`GUARD REFUSED: ${g.reason}. Nothing written.`);
    process.exit(2);
  }
  if (DRY) { log('dry run: nothing written'); return; }
  await writeFile(OUT, serialize(index));
  await writeFile(META, JSON.stringify({
    generatedAt: new Date().toISOString(), counts, requests: stats.requests, retries: stats.retries, seconds,
    inputs: { providers: providers.length, pins: pins.length, feedQueries: feedQueries.length, jumpstartQueries: packQueries.length },
    floors: FLOORS,
  }, null, 2) + '\n');
  log(`wrote ${OUT} and ${META}`);
}

main().catch((e) => { log(`ERROR: ${e.stack || e}`); process.exit(1); });
