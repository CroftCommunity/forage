// 3u: content languages.
//
// VERIFIED against the source of truth on 2026-08-26, not inferred:
//   • app.bsky.feed.post.langs EXISTS — "array, maxLength 3, items format
//     language" — so posts DO annotate their own language, self-declared by
//     the posting client. Confirmed live: a getPosts probe returned
//     record.langs = ['en'].
//   • app.bsky.feed.searchPosts takes a `lang` parameter — "Filter to posts in
//     the given language" — so for search-backed boards the filter can run
//     server-side.
//   • app.bsky.actor.defs has NO language preference. The full def list is
//     adultContentPref, contentLabelPref, savedFeedsPref(V2), personalDetails,
//     declaredAge, feedView, threadView, interests, mutedWords, hiddenPosts,
//     labelers, bskyAppState, postInteractionSettings — and the word "lang"
//     appears nowhere in it. The official app's "content languages" setting is
//     therefore app-local, NOT account state: we cannot read it and cannot
//     write it.
//
// So Forage's language preference is Forage's own, device-local, like the
// presentation mode. That is a limitation to state, never to paper over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stored, active, set, clear, primary, matches, hiddenCount, annotate } from '../js/lang.js';

const withStore = (fn) => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  try { return fn(map); } finally { delete globalThis.localStorage; }
};

test('never chosen, the filter follows the browser — only languages the panel can show', () => {
  // Owner, 2026-08-30: "default to the browser language". The browser's list
  // is ordered and regional; the seed is base tags, de-duped, and only ones
  // Forage offers a checkbox for — a preference the panel cannot display is
  // one the reader cannot see or undo.
  withStore(() => {
    assert.equal(stored(), null, 'nothing chosen yet');
    assert.deepEqual(active(['pt-BR', 'pt', 'en-US']), ['pt', 'en']);
    assert.deepEqual(active(['nl', 'sv']), [], 'a browser in languages Forage cannot list filters nothing');
    assert.deepEqual(active([]), []);
    assert.equal(primary(['ja-JP']), 'ja', 'the browser seed also names the primary language');
    assert.equal(matches({ langs: ['ja'] }, active(['en'])), false, 'so a Japanese post is hidden for an English browser');
    assert.equal(matches({ langs: [] }, active(['en'])), true, 'and an undeclared one still never is');
  });
});

test('"show every language" is a CHOICE that survives reload — it does not fall back to the browser', () => {
  withStore((map) => {
    clear();
    assert.equal(map.get('forage.langs'), '', 'stored as an explicit empty choice, not removed');
    assert.deepEqual(stored(), []);
    assert.deepEqual(active(['en-US']), [], 'the browser is ignored once you have chosen');
    assert.equal(primary(['en-US']), null);
    set(['en']); set([]);
    assert.equal(map.get('forage.langs'), '', 'unchecking the last box is the same choice');
    assert.deepEqual(active(['en-US']), []);
  });
});

test('3u: a preference filters by DECLARED language, and an undeclared post is never hidden', () => {
  assert.equal(matches({ langs: ['en'] }, ['en']), true);
  assert.equal(matches({ langs: ['ja'] }, ['en']), false);
  assert.equal(matches({ langs: ['ja', 'en'] }, ['en']), true, 'a multilingual post counts as either');
  assert.equal(matches({ langs: ['pt-BR'] }, ['pt']), true, 'the base tag matches its regional variants');
  assert.equal(matches({ langs: ['pt'] }, ['pt-BR']), true, 'and the other way round');
  // the honest default for silence: langs is optional in the lexicon, and a
  // post that never said is not a post in the wrong language
  assert.equal(matches({ langs: [] }, ['en']), true);
  assert.equal(matches({}, ['en']), true);
});

test('3u: choosing languages persists; clearing returns to no filter', () => {
  withStore((map) => {
    set(['en', 'ja']);
    assert.equal(map.get('forage.langs'), 'en,ja');
    assert.deepEqual(active(), ['en', 'ja']);
    assert.equal(primary(), 'en');
    clear();
    assert.deepEqual(active(['en']), []);
    assert.equal(primary(['en']), null, 'every language means no primary');
  });
});

test('3u: junk in storage reads as no preference, and set normalizes what it is given', () => {
  withStore((map) => {
    for (const junk of ['', ' , ,', ',,,']) {
      map.set('forage.langs', junk);
      assert.deepEqual(active(['en']), [], `${JSON.stringify(junk)} is not a language list — it reads as every language`);
    }
    set([' EN ', 'ja', 'en', '']); // trimmed, lowercased, de-duped, blanks dropped
    assert.deepEqual(active(), ['en', 'ja']);
    assert.throws(() => set('en'), /array/i, 'a bare string is a mistake worth naming');
  });
});

test('3u: hiddenCount reports what the filter removed — a silent filter is a lie', () => {
  const posts = [{ langs: ['en'] }, { langs: ['ja'] }, { langs: ['de'] }, { langs: [] }];
  assert.equal(hiddenCount(posts, ['en']), 2);
  assert.equal(hiddenCount(posts, []), 0, 'no preference hides nothing');
});

test('3u: annotate marks a post whose language is not your primary one', () => {
  // with a preference set, the chip names what the post declared
  assert.equal(annotate({ langs: ['ja'] }, ['en']), 'ja');
  assert.equal(annotate({ langs: ['en'] }, ['en']), null, 'no chip for your own language — that is just noise');
  assert.equal(annotate({ langs: [] }, ['en']), null, 'nothing declared, nothing to annotate');
  // with NO preference the browser's language stands in, so a board of mixed
  // languages is still legible without forcing a choice first
  assert.equal(annotate({ langs: ['ja'] }, [], 'en-US'), 'ja');
  assert.equal(annotate({ langs: ['en'] }, [], 'en-US'), null);
  assert.equal(annotate({ langs: ['ja'] }, [], 'ja-JP'), null);
});
