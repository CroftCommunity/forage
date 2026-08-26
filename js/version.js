// 3o: which build am I looking at? The service worker's CACHE name is the
// shell version (it is bumped with every runtime change), so comparing the
// deployed sw.js against the cache this browser actually holds answers
// "did my deploy land, and am I running it?" — pure halves here, I/O below.

export function parseShellVersion(swSource) {
  const m = String(swSource || '').match(/const CACHE = ['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

export function versionStatus({ deployed, running }) {
  if (!deployed) return { state: 'unknown', label: `running ${running || 'uncached'} — could not reach the server to compare` };
  if (!running) return { state: 'live', label: `${deployed} (live — no cached shell on this device yet)` };
  if (deployed === running) return { state: 'current', label: `${deployed} (current)` };
  return { state: 'stale', label: `running ${running}, but ${deployed} is deployed — reload to update` };
}

// The I/O halves, browser-only.
export async function deployedVersion() {
  try {
    const res = await fetch('/sw.js', { cache: 'no-store' });
    return parseShellVersion(await res.text());
  } catch { return null; }
}

export async function runningVersion() {
  try {
    const keys = await caches.keys();
    return keys.find((k) => k.startsWith('forage-v')) || null;
  } catch { return null; }
}
