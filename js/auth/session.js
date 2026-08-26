// The OAuth session module (2b) — forage's identity seam. Wraps the vendored
// official client (vendor/atproto-oauth-client-browser.js, pinned by
// test/vendor.test.js) behind a small state machine the app consumes.
// arecipe-precedent facts baked in (D4-proven live):
//  - the loopback client_id carries an EXPLICIT scope (bare `atproto` cannot
//    call appview-proxied RPCs) and an IP-LITERAL redirect (never `localhost`)
//  - the client_id is pathname-independent (a token minted on one page must
//    refresh on every page — arecipe's local-dev refresh bug)
//  - the library owns persistence: sessions live in IndexedDB and restore via
//    init(); this module deliberately adds NO storage of its own.

export const OAUTH_SCOPE = 'atproto transition:generic';
export const PRODUCTION_ORIGIN = 'https://forage.fyi';

export function isLoopbackHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

// Which OAuth client (if any) this origin can run: loopback (local dev) →
// the atproto loopback client; the production origin → the hosted
// client-metadata document; anything else → none (read-only, never crashes).
export function authModeFor(origin, hostname) {
  if (isLoopbackHostname(hostname)) return 'loopback';
  if (origin === PRODUCTION_ORIGIN) return 'hosted';
  return 'none';
}

// One stable loopback client_id: single redirect_uri at the origin root
// (forage is a single-page hash-router app), scope explicit, pathname ignored.
export function buildLoopbackClientId(location) {
  const host = location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
  const authority = `http://${host}${location.port === '' ? '' : `:${location.port}`}`;
  const params = [
    `redirect_uri=${encodeURIComponent(`${authority}/`)}`,
    `scope=${encodeURIComponent(OAUTH_SCOPE)}`,
  ];
  return `http://localhost?${params.join('&')}`;
}

// Whether a location.search OR location.hash is an OAuth authorization-code
// callback (both code and state present). atproto browser clients get the
// response in the FRAGMENT by default (response_mode=fragment — observed live
// at 2c: '#state=…&iss=…&code=…'), so the boot path must check both before
// the hash router interprets the fragment as a route.
export function isOAuthCallback(searchOrHash) {
  const params = new URLSearchParams(searchOrHash.replace(/^[?#]/, ''));
  return params.has('code') && params.has('state');
}

// 3k: the account roster — multiple accounts, completely separate, reachable
// from one page. The OAuth library keeps each account's session in its own
// store; this remembers WHICH accounts this device has signed in, so the
// switcher can offer them. Device-local, like theme/skin/mode.
const ACCOUNTS_KEY = 'forage.accounts';

const localStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  remove: (k) => { try { localStorage.removeItem(k); } catch {} },
};

export function createAccountRoster(store = localStore) {
  const read = () => {
    try {
      const raw = store.get(ACCOUNTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((a) => a && a.did) : [];
    } catch { return []; } // a corrupt roster is an empty roster, never a crash
  };
  const write = (list) => store.set(ACCOUNTS_KEY, JSON.stringify(list));
  return {
    list: read,
    remember({ did, handle }) {
      const list = read();
      const at = list.findIndex((a) => a.did === did);
      if (at === -1) list.push({ did, handle });
      else list[at] = { did, handle };
      write(list);
      return list;
    },
    forget(did) {
      const list = read().filter((a) => a.did !== did);
      write(list);
      return list;
    },
  };
}

// The session manager: a state machine over the client PORT
// ({ init, signIn }) so tests drive a fake and production drives the real
// vendored client. States: unknown → (restore) → signed-out | signed-in;
// signIn() → pending (the authorize redirect leaves the page).
export function createSessionManager({ client }) {
  let state = 'unknown';
  let session = null;
  const listeners = new Set();
  const setState = (next) => {
    state = next;
    for (const fn of listeners) fn(state);
  };

  return {
    state: () => state,
    currentSession: () => session,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // Restore an existing session, or complete a login callback (the library's
    // init() does both). Null when signed out.
    async restore() {
      const result = await client.init();
      if (result === undefined) {
        session = null;
        setState('signed-out');
        return null;
      }
      session = result.session;
      setState('signed-in');
      return session;
    },

    // Begin the interactive sign-in redirect. Resolves only on failure/abort.
    async signIn(handle) {
      setState('pending');
      try {
        await client.signIn(handle);
      } catch (e) {
        setState(session ? 'signed-in' : 'signed-out');
        throw e;
      }
    },

    // 3k: switch to another remembered account. The library restores that
    // account's own session — the accounts never share state.
    async switchTo(did) {
      if (typeof client.restore !== 'function') {
        throw new Error('this client cannot switch accounts (no restore support)');
      }
      const next = await client.restore(did);
      if (!next) throw new Error(`could not restore ${did} — sign in again`);
      session = next;
      setState('signed-in');
      return session;
    },

    async signOut() {
      if (session === null) { setState('signed-out'); return; }
      await session.signOut();
      session = null;
      setState('signed-out');
    },

    // The DPoP-bound fetch, for lens/BBS consumers. Refuses with words when
    // signed out — a consumer must gate on the session, not swallow a 401.
    fetch(pathname, init) {
      if (session === null) {
        return Promise.reject(new Error('signed out — no session fetch available (sign in first)'));
      }
      return session.fetchHandler(pathname, init);
    },
  };
}

// The real boot path (browser only): dynamic-import the vendored bundle,
// build the client for this origin's auth mode, wrap it in the manager.
// Returns null on origins with no OAuth client (read-only) — callers render
// the signed-out surface. Vendor-absent fails loud with words.
export async function initSession() {
  // The workflow-harness seam (e2e/): a journey may install a fake manager
  // before boot; production never sets this. Same pattern as udm's fake
  // chrome.runtime — the privileged boundary is the thing you fake.
  if (typeof window !== 'undefined' && window.__forageFakeSessionManager) {
    return window.__forageFakeSessionManager;
  }
  const mode = authModeFor(window.location.origin, window.location.hostname);
  if (mode === 'none') return null;
  let vendor;
  try {
    vendor = await import('../../vendor/atproto-oauth-client-browser.js');
  } catch (e) {
    throw new Error(`vendored OAuth client failed to load — re-vendor per its header (${e.message})`);
  }
  const { BrowserOAuthClient, atprotoLoopbackClientMetadata } = vendor;
  if (typeof BrowserOAuthClient !== 'function' || typeof atprotoLoopbackClientMetadata !== 'function') {
    throw new Error('vendored OAuth client is missing its exports — bundle drift; see test/vendor.test.js');
  }
  const clientMetadata = mode === 'hosted'
    ? await (await fetch('/client-metadata.json')).json()
    : atprotoLoopbackClientMetadata(buildLoopbackClientId(window.location));
  const client = new BrowserOAuthClient({
    handleResolver: 'https://bsky.social',
    clientMetadata,
  });
  return createSessionManager({ client });
}
