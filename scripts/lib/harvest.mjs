// The harvest's pure steps — plan 2026-09-08-plan-feed-index-and-jumpstarts,
// Phase 0. The network is ONE function the CLI (scripts/harvest-feeds.mjs)
// owns; everything here folds recorded AppView views into an index and is
// tested hermetic. The numbers this reproduces are the plan's D1–D7.
import { INDEX_VERSION, bandOf, langHint, scriptOf, validateIndex } from '../../js/feed-index.js';

// The plan's floors (D5, D6): 100 likes is the knee of the liveness curve
// (87% live above it, a coin flip below 10); 10 joins is the same knee for
// packs; a bare floor is an English filter, so each non-Latin script keeps
// its top 25 above a small minimum; and one creator can publish thousands of
// machine rows (bluetrends: 2,966 feeds, 3,421 likes), so a creator keeps 25.
export const FLOORS = Object.freeze({ likes: 100, joins: 10, perScript: 25, minLikes: 5, perCreator: 25 });

const rkeyOf = (uri) => String(uri || '').split('/').pop();
const likesOf = (v) => v.likeCount ?? 0;
const joinsOf = (v) => v.joinedAllTimeCount ?? 0;
const labelsOf = (v) => [...new Set((v.labels || []).filter((l) => !l.neg).map((l) => l.val))].sort();
const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160);

// A generator view → an index row. Key order is fixed HERE so the serialized
// file is byte-stable: uri, name, desc, creator, platform, band, tags, then
// the optionals in a fixed order. No count (D2).
export function slimFeed(v) {
  const row = {
    uri: v.uri,
    name: (v.displayName || '').trim() || rkeyOf(v.uri),
    desc: clip(v.description),
    creator: v.creator?.handle || '',
    platform: String(v.did || '').startsWith('did:web:') ? v.did.slice('did:web:'.length) : null,
    band: bandOf(likesOf(v)),
    tags: [],
  };
  const lang = langHint(`${row.name} ${row.desc}`);
  if (lang) row.lang = lang;
  const labels = labelsOf(v);
  if (labels.length) row.labels = labels;
  if (v.contentMode === 'app.bsky.feed.defs#contentModeVideo') row.video = true;
  return row;
}

// A starter pack view → a jumpstart row, plus the feed uris it names (kept
// aside as `feedUris` for the edge step; never written to the file).
export function slimPack(v) {
  const rec = v.record || {};
  const row = {
    uri: v.uri,
    name: (rec.name || '').trim() || rkeyOf(v.uri),
    desc: clip(rec.description),
    creator: v.creator?.handle || '',
    members: v.list?.listItemCount ?? 0,
    band: bandOf(joinsOf(v)),
    tags: [],
  };
  const lang = langHint(`${row.name} ${row.desc}`);
  if (lang) row.lang = lang;
  const labels = labelsOf(v);
  if (labels.length) row.labels = labels;
  row.feedUris = (v.feeds || []).map((f) => f.uri).filter(Boolean);
  return row;
}

// The language rescue (D5): below the floor, the top N per non-Latin script,
// above a small minimum so a dead zero-like feed is not "rescued".
export function rescueByScript(views, { floor = FLOORS.likes, perScript = FLOORS.perScript, minLikes = FLOORS.minLikes } = {}) {
  const groups = new Map();
  for (const v of views) {
    const n = likesOf(v);
    if (n >= floor || n < minLikes) continue;
    const s = scriptOf(`${v.displayName || ''} ${(v.description || '').slice(0, 150)}`);
    if (s === 'LATIN' || s === 'NONE') continue;
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(v);
  }
  const kept = new Set();
  for (const vs of groups.values()) {
    vs.sort((a, b) => likesOf(b) - likesOf(a)).slice(0, perScript).forEach((v) => kept.add(v.uri));
  }
  return kept;
}

// One creator keeps at most N feeds, by likes.
export function capPerCreator(views, { cap = FLOORS.perCreator } = {}) {
  const groups = new Map();
  for (const v of views) {
    const k = v.creator?.did || v.creator?.handle || '?';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const out = [];
  for (const vs of groups.values()) out.push(...vs.sort((a, b) => likesOf(b) - likesOf(a)).slice(0, cap));
  return out;
}

// [jumpstart, feed] pairs — unique, sorted, so the diff is stable.
export function packEdges(slimPacks) {
  const seen = new Set();
  const out = [];
  for (const p of slimPacks) {
    for (const f of p.feedUris || []) {
      const k = `${p.uri}\n${f}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([p.uri, f]);
    }
  }
  return out.sort((a, b) => (a[0] + '\n' + a[1] < b[0] + '\n' + b[1] ? -1 : 1));
}

const byUri = (a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
const byHandle = (a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0);

// The fold: floors, rescue, cap, forced keeps (browse + suggested + pins),
// packs above their floor, and the feeds only a pack leads to (D7) hydrated
// in by the CLI. Validates before returning — a harvest that cannot pass its
// own validator has nothing to write.
export function buildIndex({ feeds = [], packs = [], keepFeeds = new Set(), hydrated = [], providers = [], floors = FLOORS } = {}) {
  const capped = capPerCreator(feeds, { cap: floors.perCreator });
  const rescued = rescueByScript(capped, { floor: floors.likes, perScript: floors.perScript, minLikes: floors.minLikes });
  const chosen = new Map();
  for (const v of capped) {
    if (likesOf(v) >= floors.likes || rescued.has(v.uri) || keepFeeds.has(v.uri)) chosen.set(v.uri, v);
  }
  // forced keeps that the sweep never returned (D3's 19) arrive hydrated
  const hydratedByUri = new Map(hydrated.map((v) => [v.uri, v]));
  for (const uri of keepFeeds) if (!chosen.has(uri) && hydratedByUri.has(uri)) chosen.set(uri, hydratedByUri.get(uri));

  const slimPacks = packs.filter((p) => joinsOf(p) >= floors.joins).map(slimPack).sort(byUri);
  for (const p of slimPacks) {
    for (const uri of p.feedUris) {
      if (!chosen.has(uri) && hydratedByUri.has(uri)) chosen.set(uri, hydratedByUri.get(uri));
    }
  }
  const feedRows = [...chosen.values()].map(slimFeed).sort(byUri);
  const present = new Set(feedRows.map((r) => r.uri));
  const edges = packEdges(slimPacks).filter(([, f]) => present.has(f));
  const jumpstarts = slimPacks.map(({ feedUris, ...row }) => row);
  const index = {
    v: INDEX_VERSION,
    feeds: feedRows,
    jumpstarts,
    edges,
    providers: [...providers].map((p) => ({ handle: p.handle, kind: p.kind, tags: [...(p.tags || [])] })).sort(byHandle),
  };
  const v = validateIndex(index);
  if (!v.ok) throw new Error(`harvest built an invalid index:\n  ${v.errors.slice(0, 10).join('\n  ')}`);
  return index;
}

// VERIFICATION shape 3: a run that graded an empty set must not be green. A
// throttled or reshaped AppView answer yields a materially smaller corpus;
// this refuses it, and the CLI exits non-zero, leaving main untouched.
export function guard(prev, next, { ratio = 0.8, minFeeds = 500, minPacks = 300 } = {}) {
  const reasons = [];
  if (next.feeds < minFeeds) reasons.push(`feeds ${next.feeds} < ${minFeeds}`);
  if (next.jumpstarts < minPacks) reasons.push(`jumpstarts ${next.jumpstarts} < ${minPacks}`);
  if (prev) {
    if (next.feeds < prev.feeds * ratio) reasons.push(`feeds ${next.feeds} < ${Math.round(ratio * 100)}% of ${prev.feeds}`);
    if (next.jumpstarts < prev.jumpstarts * ratio) reasons.push(`jumpstarts ${next.jumpstarts} < ${Math.round(ratio * 100)}% of ${prev.jumpstarts}`);
  }
  return reasons.length ? { ok: false, reason: reasons.join('; ') } : { ok: true };
}

// One row per line, tables in a fixed order, no timestamp: the same index
// serializes to the same bytes, and a weekly diff reads as membership.
export function serialize(index) {
  const rows = (xs) => (xs.length ? '\n' + xs.map((x) => JSON.stringify(x)).join(',\n') + '\n' : '');
  return `{"v":${JSON.stringify(index.v)},\n`
    + `"feeds":[${rows(index.feeds)}],\n`
    + `"jumpstarts":[${rows(index.jumpstarts)}],\n`
    + `"edges":[${rows(index.edges)}],\n`
    + `"providers":[${rows(index.providers)}]\n}\n`;
}
