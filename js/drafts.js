// feed-row v4 (owner, 2026-08-30): a reply you started is kept in THIS browser,
// keyed by the post you were answering, until you send it or discard it. It
// survives Cancel, a reload and a closed tab; it does not cross devices.
//
// Why local and not Bluesky's own drafts (app.bsky.draft.*): the lexicon's
// `draft` object carries posts, langs and gate rules — and no reply target. A
// native draft would keep the words but forget which post they answer, so the
// parent would have to live here anyway. Recorded on the feed-row mock as the
// owner's decision; a native mirror is the follow-on, not this module.
//
// Blank text is no draft; a corrupt entry reads as none — the box must never
// fail to open because of what a browser held.

export const PREFIX = 'forage.draft:';
export const keyFor = (parentUri) => PREFIX + parentUri;

export function load(parentUri) {
  try {
    const raw = localStorage.getItem(keyFor(parentUri));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d.text === 'string' && d.text.trim() ? { text: d.text, savedAt: d.savedAt || null } : null;
  } catch { return null; }
}

export function save(parentUri, text) {
  const t = String(text ?? '');
  if (!t.trim()) { clear(parentUri); return null; }
  const d = { text: t, savedAt: new Date().toISOString() };
  try { localStorage.setItem(keyFor(parentUri), JSON.stringify(d)); } catch { /* private mode: the box still works */ }
  return d;
}

export function clear(parentUri) {
  try { localStorage.removeItem(keyFor(parentUri)); } catch { /* nothing to forget */ }
}
