// The record schemas the RUNTIME needs, as data it can reach in a browser.
//
// `lexicons/*.json` is canonical. The browser cannot read files, this app has no
// build step, and JSON module imports are not portable enough to rely on — so a
// runtime reader gets a pinned copy here, and `test/lexicons.test.js` asserts it
// is byte-equal to the file it came from. That is the same second-copy-with-a-
// test pattern the collection set already uses, and the test is what stops the
// copy becoming a second schema.
//
// MINIMAL ON PURPOSE: an entry is added when a runtime reader actually needs to
// validate against it, not pre-emptively for all ten. An unused copy is a copy
// that drifts in the only way the test cannot catch — by being right about a
// schema nobody consults.

/** `lexicons/fyi.forage.tagsub.json` → defs.main.record */
export const TAGSUB_RECORD = Object.freeze({
  type: 'object',
  required: ['tag', 'createdAt'],
  properties: {
    tag: {
      type: 'string',
      minLength: 1,
      maxLength: 640,
      description: "The hashtag, bare and lowercase — no leading '#', which is punctuation rather than part of the name. Never empty: an empty tag is not a tag, and the rule lives here rather than in a hand-rolled check so one schema stays the only schema.",
    },
    createdAt: {
      type: 'string',
      format: 'datetime',
      description: 'Subscribe time. Also the natural ordering — no stored order is kept.',
    },
  },
});
