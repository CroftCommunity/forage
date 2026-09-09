// Workflow harness: the network shim (1d) — an init script that fences
// window.fetch for the Bluesky hosts. Hermetic by default: a fenced host with
// no declared fixture answers 599 and RECORDS the miss (window.__shimMisses),
// so an unexpected network dependency fails a test loudly instead of hanging
// on the real network. Fixture routing is by URL substring, first match wins.
//
// fetchShim({ responses }) — responses: { '<url substring>': <JSON payload> }.
// Options objects are consumed whole by the caller (scenario.mjs) and this
// module takes what it needs — nothing is re-listed (udm's allowlist trap).
//
// A payload may instead be `{ __sequence: [p1, p2, …] }`: the shim serves entry
// 0 until the test calls `window.__shimAdvance()`, then entry 1, and so on,
// pinning on the last. That is the only way to express a surface CHANGING
// between two reads of the same URL — a feed that gained posts while the reader
// was inside a thread — which a fixed payload cannot say at all.
//
// It advances on an explicit CALL and not on a request count, which was the
// first design and was wrong: forage mounts a board three times on arrival
// (`store.subscribe(render)` re-renders on every store change and each mount
// re-fetches), so a count-based sequence had already run to its end before the
// test could say "now the world changes". A generation the test controls says
// WHEN, which is the thing being tested. A plain object is unchanged.

// 4g: constellation.microcosm.blue is fenced too — an unfenced host would let a
// workflow reach the real network and quietly stop being hermetic.
// plc.directory joined 2026-09-08: the pds-walker beta resolves identities there (an
// unfenced host would let a workflow reach the real directory and stop being hermetic).
// feed-index (2026-09-09): the SAME-ORIGIN index files are fenced too, so a
// scenario's fixture index answers in-page — ahead of the service worker,
// which a Playwright page.route cannot see once the worker controls the page
// (found by signin.workflow.mjs: the guest step saw the fixture, the signed-in
// step after it saw the real, weekly-changing file).
const FENCED = ['bsky.social', 'public.api.bsky.app', 'bsky.network', 'constellation.microcosm.blue', 'plc.directory', '/data/feed-index'];

export function fetchShim({ responses = {}, passThrough = [] } = {}) {
  return `(() => {
    const FENCED = ${JSON.stringify(FENCED)};
    // a fenced substring a scenario lets through to the real server (the
    // committed index, for mock-snaps' captures)
    const PASS = ${JSON.stringify(passThrough)};
    const RESPONSES = ${JSON.stringify(responses)};
    window.__shimMisses = [];
    window.__shimHits = [];
    const real = window.fetch.bind(window);
    // the generation every declared sequence reads; the test moves it
    window.__shimGeneration = 0;
    window.__shimAdvance = () => ++window.__shimGeneration;
    window.fetch = (input, init) => {
      const url = String(typeof input === 'string' ? input : input.url);
      if (!FENCED.some((h) => url.includes(h))) return real(input, init);
      if (PASS.some((h) => url.includes(h))) return real(input, init);
      for (const [needle, declared] of Object.entries(RESPONSES)) {
        if (url.includes(needle)) {
          // Phase 3: uploadBlob sends raw bytes, not JSON. String(aBlob) is
          // "[object Blob]" — useless and quietly misleading — so a binary
          // body is recorded as its type and size instead, and the body feed
          // stays a string only when it genuinely is one.
          const raw = init && init.body;
          const isBinary = raw && typeof raw !== 'string';
          window.__shimHits.push({
            url, method: (init && init.method) || 'GET',
            body: isBinary ? null : (raw ? String(raw) : null),
            binary: isBinary ? { type: raw.type || null, size: raw.size ?? (raw.byteLength ?? null) } : null,
          });
          // a sequence reads the current generation and pins on its last entry
          let payload = declared;
          if (declared && declared.__sequence) {
            payload = declared.__sequence[Math.min(window.__shimGeneration, declared.__sequence.length - 1)];
          }
          // { __status: 502 } declares a FAILING route — a fixture for "this
          // source did not answer" (mixes, 2026-09-08), distinct from a miss.
          // feed-index (2026-09-09): { __echoFeeds: {...view} } answers a
          // getFeedGenerators batch with one view PER URI IT ASKED FOR — the
          // only way to fixture hydration, whose request is a list the test
          // cannot know in advance (it is the index's own rows). NB this
          // comment lives inside a template literal: no backticks here.
          if (payload && payload.__echoFeeds) {
            const u = new URL(url);
            const uris = [...u.searchParams.entries()].filter(([k]) => k.startsWith('feeds[')).map(([, v]) => v);
            return Promise.resolve(new Response(JSON.stringify({ feeds: uris.map((uri) => ({ uri, ...payload.__echoFeeds })) }), {
              status: 200, headers: { 'content-type': 'application/json' },
            }));
          }
          if (payload && payload.__status) {
            return Promise.resolve(new Response(JSON.stringify({ error: 'Declared', message: 'fixture declares HTTP ' + payload.__status }), {
              status: payload.__status, headers: { 'content-type': 'application/json' },
            }));
          }
          return Promise.resolve(new Response(JSON.stringify(payload), {
            status: 200, headers: { 'content-type': 'application/json' },
          }));
        }
      }
      window.__shimMisses.push(url);
      return Promise.resolve(new Response(JSON.stringify({ error: 'ShimMiss', message: 'no fixture for ' + url }), {
        status: 599, headers: { 'content-type': 'application/json' },
      }));
    };
  })();`;
}
