// W9 — do our hardcoded curated names still match the network? (4h, LIVE=1 only)
//
// The runtime deliberately does NOT resolve the guest sidebar's names: it
// paints synchronously from CURATED, with no request and no second paint, and
// that determinism is worth keeping for two entries on a guest surface.
//
// The cost of that choice is drift, and drift with no detector is how
// `"What's Hot"` shipped for months after Bluesky renamed the feed to
// "Discover". So the detector lives here instead of in the runtime: it asks
// the network what each curated feed calls itself and fails when our fallback
// no longer agrees. Nobody has to notice a screenshot.
//
// live = true, so this NEVER runs in push CI (it touches the real network) and
// the runner SKIP-reports it loudly rather than leaving it silently absent.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const live = true;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// CURATED lives in js/ui/lens-views.js, which cannot be imported outside a
// browser, so this reads it as SOURCE — the same weaker-on-purpose approach
// test/a11y-names.test.js takes, and for the same reason. A parse failure here
// is a real failure: it means the shape moved and this check went blind.
function curatedEntries() {
  const src = readFileSync(join(root, 'js/ui/lens-views.js'), 'utf8');
  const block = src.match(/const CURATED = \[([\s\S]*?)\n\];/);
  assert.ok(block, 'could not find the CURATED array — this check has gone blind, fix the scan');
  const out = [];
  for (const entry of block[1].split(/(?=\{ slug:)/)) {
    if (!/^\{ slug:/.test(entry.trim())) continue;
    const title = entry.match(/title: '([^']+)'/) || entry.match(/title: "([^"]+)"/);
    const uri = entry.match(/uri: '(at:\/\/[^']+)'/);
    const actor = entry.match(/actor: '([^']+)'/);
    assert.ok(title, `a curated entry parsed without a title:\n${entry}`);
    assert.ok(uri || actor, `a curated entry parsed without a feed uri or an author actor:\n${entry}`);
    out.push(uri
      ? { what: uri[1], title: title[1],
          url: `https://public.api.bsky.app/xrpc/app.bsky.feed.getFeedGenerator?feed=${encodeURIComponent(uri[1])}`,
          read: (j) => j?.view?.displayName }
      : { what: `@${actor[1]}`, title: title[1],
          url: `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor[1])}`,
          read: (j) => j?.displayName });
  }
  assert.ok(out.length, 'no curated entries found — the scan is looking at the wrong shape');
  return out;
}

// v11: the SECOND thing this file watches. GUEST_BLIND_BLURBS names feeds whose
// description addresses an account, so a signed-out reader is shown no
// description at all. That decision is about a specific sentence — "Trending
// content from your personal network" — and if the feed rewrites it to
// something that reads fine to a guest, hiding it becomes wrong and nothing
// else would ever say so. This does not fail on a change; it PRINTS the
// description and fails only if the feed stops being reachable or stops
// describing itself, because whether a new sentence still addresses an account
// is a judgement, not a comparison.
async function reportGuestBlindBlurbs() {
  const src = readFileSync(join(root, 'js/substrates/lens.js'), 'utf8');
  const block = src.match(/GUEST_BLIND_BLURBS = new Set\(\[([\s\S]*?)\n\]\);/);
  assert.ok(block, 'could not find GUEST_BLIND_BLURBS — this check has gone blind, fix the scan');
  const uris = [...block[1].matchAll(/'(at:\/\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(uris.length, 'no guest-blind feeds found — the scan is looking at the wrong shape');
  for (const uri of uris) {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getFeedGenerator?feed=${encodeURIComponent(uri)}`);
    assert.ok(res.ok, `${uri}: the network would not answer (${res.status})`);
    const view = (await res.json())?.view;
    assert.ok(view?.description,
      `${uri}: the network answered with no description at all — a feed that describes itself is the premise of hiding it from guests, so re-decide rather than keeping the entry`);
    console.log(`  guest-blind ${view.displayName}: ${JSON.stringify(view.description)}`);
  }
}

export async function run() {
  const drift = [];
  for (const { what, title, url, read } of curatedEntries()) {
    const res = await fetch(url);
    assert.ok(res.ok, `${what}: the network would not answer (${res.status})`);
    const live = read(await res.json());
    assert.ok(live, `${what}: the network answered without a display name — shape drift, not name drift`);
    console.log(`  ${what}: ours ${JSON.stringify(title)} \u00b7 network ${JSON.stringify(live)}`);
    if (live !== title) drift.push(`${what}\n    ours:    ${JSON.stringify(title)}\n    network: ${JSON.stringify(live)}`);
  }
  assert.deepEqual(drift, [],
    `a curated fallback name no longer matches the network:\n  ${drift.join('\n  ')}\n` +
    '  Update the CURATED entry. The rkey and the handle are the route and never change; the name is theirs.');
  await reportGuestBlindBlurbs();
}
