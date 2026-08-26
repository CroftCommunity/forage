// Workflow harness: the network shim (1d) — an init script that fences
// window.fetch for the Bluesky hosts. Hermetic by default: a fenced host with
// no declared fixture answers 599 and RECORDS the miss (window.__shimMisses),
// so an unexpected network dependency fails a test loudly instead of hanging
// on the real network. Fixture routing is by URL substring, first match wins.
//
// fetchShim({ responses }) — responses: { '<url substring>': <JSON payload> }.
// Options objects are consumed whole by the caller (scenario.mjs) and this
// module takes what it needs — nothing is re-listed (udm's allowlist trap).

const FENCED = ['bsky.social', 'public.api.bsky.app', 'bsky.network'];

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
          window.__shimHits.push(url);
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
