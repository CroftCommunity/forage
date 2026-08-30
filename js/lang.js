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
// Three states in one key (owner, 2026-08-30: "default to the browser
// language"):
//   absent  — never chosen: follow the browser, limited to LANG_CHOICES
//   ''      — chosen "every language": no filter, and NOT re-seeded on reload
//   'en,ja' — chosen languages
// The middle state is why clear() writes '' rather than removing the key: a
// removed key would fall back to the browser and "show every language" would
// quietly undo itself on the next visit. Whatever the filter is doing, the
// board says what it hid (data-lang-hidden) — a silent filter is a lie.

const KEY = 'forage.langs';

// The languages the settings panel can show a checkbox for. A browser
// preference outside this list is never seeded: a filter the panel cannot
// display is one the reader cannot see or undo.
export const LANG_CHOICES = Object.freeze([
  ['en', 'English'], ['ja', '日本語'], ['pt', 'Português'], ['es', 'Español'],
  ['de', 'Deutsch'], ['fr', 'Français'], ['ko', '한국어'], ['uk', 'Українська'],
]);
const OFFERED = new Set(LANG_CHOICES.map(([code]) => code));

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

// null = never chosen; [] = chose every language; else the chosen list.
export function stored() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (raw === null) return null;
  return normalize(raw.split(','));
}

// What the browser would choose: its ordered list, as base tags, de-duped,
// limited to what the panel offers. navLangs is a parameter so a test can be a
// browser in Portuguese without pretending to be one.
export function browserDefault(navLangs = globalThis.navigator?.languages ?? []) {
  return normalize([...navLangs].map(base)).filter((l) => OFFERED.has(l));
}

export function active(navLangs) { return stored() ?? browserDefault(navLangs); }

// The language a board is "in" for annotation purposes; null when every
// language is chosen (or the browser offers none Forage lists).
export function primary(navLangs) { return active(navLangs)[0] ?? null; }

export function set(tags) {
  if (!Array.isArray(tags)) throw new Error(`content languages must be an array of tags, got ${typeof tags}`);
  try { localStorage.setItem(KEY, normalize(tags).join(',')); }
  catch { /* private mode: the board still works, just unremembered */ }
}

// "Show every language" — an explicit choice, stored as one (see the key's
// three states above).
export function clear() { set([]); }

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
