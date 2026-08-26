// 3w: building a post record. Pure — no network, no session, no DOM. The
// substrate writes it; this decides what "it" is.
//
// Verified against app/bsky/feed/post.json (2026-08-26): required text +
// createdAt; text is capped at 3000 BYTES and 300 GRAPHEMES (two limits, both
// real); facets are BYTE-indexed; `tags` is for hashtags NOT in the text, so a
// tag the writer typed needs a facet instead.

export const POST_LIMITS = Object.freeze({ graphemes: 300, bytes: 3000 });

const encoder = new TextEncoder();

// What a person means by "a character". `.length` counts UTF-16 code units,
// which makes one family emoji look like eleven characters.
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

export function graphemes(text) {
  const s = String(text ?? '');
  if (!s) return 0;
  if (segmenter) return [...segmenter.segment(s)].length;
  return [...s].length; // code points: still far closer than .length
}

export function byteLength(text) { return encoder.encode(String(text ?? '')).length; }

// Byte offset of a UTF-16 index — the whole reason facets get this wrong.
const byteOffset = (text, jsIndex) => encoder.encode(text.slice(0, jsIndex)).length;

// A tag is # followed by letters/digits/underscore/hyphen; a link is bare
// http(s). Trailing punctuation belongs to the sentence, not the URL.
const TAG_RE = /#([\p{L}\p{N}_-]+)/gu;
const LINK_RE = /https?:\/\/[^\s]+/gu;

export function detectFacets(text) {
  const s = String(text ?? '');
  const found = [];

  for (const m of s.matchAll(TAG_RE)) {
    found.push({
      start: m.index, end: m.index + m[0].length,
      feature: { $type: 'app.bsky.richtext.facet#tag', tag: m[1] },
    });
  }
  for (const m of s.matchAll(LINK_RE)) {
    const uri = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
    found.push({
      start: m.index, end: m.index + uri.length,
      feature: { $type: 'app.bsky.richtext.facet#link', uri },
    });
  }

  return found
    .sort((a, b) => a.start - b.start)
    .map((f) => ({
      index: { byteStart: byteOffset(s, f.start), byteEnd: byteOffset(s, f.end) },
      features: [f.feature],
    }));
}

// The board's tag, added only when the writer did not write it themselves.
// Matched case-insensitively and WHOLE — #gardening is not #garden.
export function withTag(text, tag) {
  const body = String(text ?? '').trim();
  const want = String(tag || '').toLowerCase();
  if (!want) return body;
  const already = [...body.matchAll(TAG_RE)].some((m) => m[1].toLowerCase() === want);
  if (already) return body;
  return body ? `${body} #${tag}` : `#${tag}`;
}

// Phase-1 live-proof finding (2026-08-26): the first real post this code ever
// wrote carried no `langs`, because nothing passed any. Every other client
// declares one, and language filters — including Forage's own (3u) — key off
// it, so an undeclared post is invisible to all of them. The browser knows the
// writer's language; use it when nothing better is available, and still say
// nothing when even that is unknown rather than guessing English.
const languageClaim = (langs, navLang) => {
  if (langs?.length) return langs;
  const base = String(navLang || '').trim().toLowerCase().split('-')[0];
  return base ? [base] : null;
};

export function buildPost({ text, langs, navLang, replyTo, now = new Date() } = {}) {
  const body = String(text ?? '').trim();
  if (!body) throw new Error('a post cannot be empty — there is nothing to say yet');

  const g = graphemes(body);
  if (g > POST_LIMITS.graphemes) {
    throw new Error(`too long: ${g} characters, and a post holds ${POST_LIMITS.graphemes}`);
  }
  const b = byteLength(body);
  if (b > POST_LIMITS.bytes) {
    throw new Error(`too long: ${b} bytes, and a post holds ${POST_LIMITS.bytes} bytes (some characters cost more than one)`);
  }

  const record = {
    $type: 'app.bsky.feed.post',
    text: body,
    createdAt: now.toISOString(),
    facets: detectFacets(body),
  };
  const claim = languageClaim(langs, navLang);
  if (claim) record.langs = claim;
  if (replyTo) {
    const { root, parent } = replyTo;
    // Both refs need a cid; a ref without one produces a reply the network
    // cannot thread. Refuse rather than write it.
    for (const [name, ref] of [['root', root], ['parent', parent]]) {
      if (!ref?.uri || !ref?.cid) throw new Error(`reply ${name} needs both a uri and a cid`);
    }
    record.reply = { root: { uri: root.uri, cid: root.cid }, parent: { uri: parent.uri, cid: parent.cid } };
  }
  return record;
}
