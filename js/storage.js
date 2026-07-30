// Schema-versioned localStorage adapter (build order step 1). The `memory`
// substrate persists the event log + dev state; a version bump can migrate or
// reset. This is the single storage seam the future adapter layer replaces.

const KEY = 'graze.state';
export const SCHEMA_VERSION = 1;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== SCHEMA_VERSION) {
      // No migrations yet; a mismatched version is discarded rather than crash.
      console.warn(`graze: discarding storage (v${data.version} != v${SCHEMA_VERSION})`);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('graze: storage read failed', e);
    return null;
  }
}

export function save(partial) {
  try {
    const cur = load() || { version: SCHEMA_VERSION, events: [], persona: null, dev: {} };
    const next = { ...cur, ...partial, version: SCHEMA_VERSION };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('graze: storage write failed', e);
  }
}

export function clearAll() {
  localStorage.removeItem(KEY);
}

export function exportJson() {
  return JSON.stringify(load() || { version: SCHEMA_VERSION, events: [] }, null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (typeof data !== 'object' || !Array.isArray(data.events)) throw new Error('invalid import: missing events[]');
  localStorage.setItem(KEY, JSON.stringify({ ...data, version: SCHEMA_VERSION }));
  return data;
}
