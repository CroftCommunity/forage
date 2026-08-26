// Workflow harness: the network shim (1d) — an init script that fences
// window.fetch for the Bluesky hosts. Hermetic by default: a fenced host with
// no declared fixture answers 599 and RECORDS the miss (window.__shimMisses),
// so an unexpected network dependency fails a test loudly instead of hanging
// on the real network. Fixture routing is by URL substring, first match wins.
//
// fetchShim({ responses }) — responses: { '<url substring>': <JSON payload> }.
// Options objects are consumed whole by the caller (scenario.mjs) and this
// module takes what it needs — nothing is re-listed (udm's allowlist trap).

// 4g: constellation.microcosm.blue is fenced too — an unfenced host would let a
// workflow reach the real network and quietly stop being hermetic.
const FENCED = ['bsky.social', 'public.api.bsky.app', 'bsky.network', 'constellation.microcosm.blue'];

export function fetchShim({ responses = {} } = {}) {
  return `(() => {
    const FENCED = ${JSON.stringify(FENCED)};
    const RESPONSES = ${JSON.stringify(responses)};
    window.__shimMisses = [];
    window.__shimHits = [];
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(typeof input === 'string' ? input : input.url);
      if (!FENCED.some((h) => url.includes(h))) return real(input, init);
      for (const [needle, payload] of Object.entries(RESPONSES)) {
        if (url.includes(needle)) {
          // Phase 3: uploadBlob sends raw bytes, not JSON. String(aBlob) is
          // "[object Blob]" — useless and quietly misleading — so a binary
          // body is recorded as its type and size instead, and the body field
          // stays a string only when it genuinely is one.
          const raw = init && init.body;
          const isBinary = raw && typeof raw !== 'string';
          window.__shimHits.push({
            url, method: (init && init.method) || 'GET',
            body: isBinary ? null : (raw ? String(raw) : null),
            binary: isBinary ? { type: raw.type || null, size: raw.size ?? (raw.byteLength ?? null) } : null,
          });
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
