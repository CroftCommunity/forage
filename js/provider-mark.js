// feed-row v2 (owner, 2026-08-30): the byline shows the name a person chose,
// and beside it a small mark says which atmo provider they post from — the
// butterfly for a bsky.social account, a plain atmosphere ring for anyone
// else. The reader can switch the mark off (Settings → Provider mark).
//
// The provider is read from the HANDLE, and only where the handle SAYS it:
// `*.bsky.social` is a bsky.social account. A custom-domain handle names no
// provider without a DID-document lookup (plc.directory, one fetch per
// author), so it gets the generic mark and the tooltip says so — a wrong
// butterfly would be a claim about where someone's data lives. Resolving the
// DID document is the recorded follow-on, not this module's job.
//
// Device-local, the rail's shape: only the word 'off' turns it off, so a
// corrupt value never costs the reader the mark.

export const KEY = 'forage.providermark';

export function enabled() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function set(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

const BSKY = Object.freeze({ id: 'bsky', label: 'Bluesky', host: 'bsky.social' });
const ATMO = Object.freeze({ id: 'atmo', label: 'the atmosphere', host: null });

// null for no handle at all (a removed or unknown author draws no mark)
export function providerOf(handle) {
  if (!handle || typeof handle !== 'string' || handle.startsWith('[')) return null;
  return /(^|\.)bsky\.social$/i.test(handle.trim()) ? BSKY : ATMO;
}

// The tooltip / accessible name for a mark. The atmosphere mark says what it
// does NOT know, so nobody reads a ring as "verified elsewhere".
export function markLabel(provider, handle) {
  if (!provider) return '';
  return provider.host
    ? `atmo provider: ${provider.host}`
    : `atmo provider: not shown by the handle (${handle}) — on the atmosphere`;
}
