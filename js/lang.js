// 3u: content languages — device-local, Forage's own.
//
// Verified 2026-08-26 (probe + official lexicons, not inference):
//   • app.bsky.feed.post.langs exists (array, max 3, format "language"), so a
//     post DECLARES its language — self-reported by the posting client.
//   • app.bsky.feed.searchPosts accepts `lang`, so search-backed boards can
//     filter server-side.
//   • app.bsky.actor.defs has NO language preference of any kind. The official
//     app's "content languages" lives in that app, not in the account, so
//     Forage can neither read nor honour it. Ours is ours. (DL-026)
//
// Empty list = no filter, which is the default: Forage never quietly narrows
// what you see.

const KEY = 'forage.langs';

// 'pt-BR' and 'pt' are the same language for filtering purposes; the region is
// a refinement nobody chooses a feed by.
const base = (tag) => String(tag || '').trim().toLowerCase().split('-')[0];

const normalize = (tags) => {
  const out = [];
  for (const t of tags) {
    const v = String(t || '').trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
};

export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw === null) return null;
  const list = normalize(raw.split(','));
  return list.length ? list : null;
}

export function active() { return stored() ?? []; }

// The language a board is "in" for annotation purposes. No preference means no
// primary — the caller may fall back to the browser, but this never guesses.
export function primary() { return stored()?.[0] ?? null; }

export function set(tags) {
  if (!Array.isArray(tags)) throw new Error(`content languages must be an array of tags, got ${typeof tags}`);
  const list = normalize(tags);
  try {
    if (list.length) localStorage.setItem(KEY, list.join(','));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the board still works, just unremembered */ }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

// A post survives the filter unless it DECLARED a language and none of them
// are yours. langs is optional in the lexicon, and a post that never said is
// not a post in the wrong language — hiding it would be us guessing.
export function matches(post, prefs = active()) {
  if (!prefs.length) return true;
  const langs = post?.langs || [];
  if (!langs.length) return true;
  const want = prefs.map(base);
  return langs.some((l) => want.includes(base(l)));
}

export function hiddenCount(posts, prefs = active()) {
  if (!prefs.length) return 0;
  return posts.filter((p) => !matches(p, prefs)).length;
}

// The chip: name the declared language when it is not the one you read in.
// With no preference stored, the browser's language stands in, so a mixed
// board is legible before anyone has chosen anything.
export function annotate(post, prefs = active(), navLang = null) {
  const langs = post?.langs || [];
  if (!langs.length) return null;
  const mine = prefs.length ? prefs.map(base) : (navLang ? [base(navLang)] : []);
  if (!mine.length) return null;
  if (langs.some((l) => mine.includes(base(l)))) return null;
  return langs[0];
}
