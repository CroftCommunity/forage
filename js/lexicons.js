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

/** `lexicons/fyi.forage.mix.json` → defs (the WHOLE block: the record refs `#row`, which lives beside it; plan 2026-09-08 mixes-on-the-pds) */
export const MIX_DEFS = Object.freeze({
  "main": {
    "type": "record",
    "description": "One composed board — how this reader arranges their own subscriptions (the accounts they follow, saved feeds and lists, subscribed hashtags) into one list, a few from each in turn, weighted per row. Meaningful only to a client holding the writer's subscriptions: the rows point at THEIR follows, THEIR feeds, THEIR tags. The record key is the mix's slug, so publishing a mix twice is one record. Deleting the record forgets the mix.",
    "key": "any",
    "record": {
      "type": "object",
      "required": [
        "name",
        "home",
        "rows",
        "createdAt",
        "updatedAt"
      ],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "maxGraphemes": 60,
          "maxLength": 600,
          "description": "What the reader calls it. The address is the record key (the slug), so a rename never moves the record."
        },
        "home": {
          "type": "boolean",
          "description": "True for the one Home record, which holds OVERRIDES only: Home is every subscription, on, at normal, and this record lists just the rows the reader changed. At most one per repo; a client reads the newest by updatedAt and reports the rest. False for a mix the reader made, whose rows are the whole mix."
        },
        "rows": {
          "type": "array",
          "description": "One entry per subscription the reader has touched (home) or chosen (custom). A subscription with no row is on at normal in Home and absent from a custom mix.",
          "items": {
            "type": "ref",
            "ref": "#row"
          }
        },
        "createdAt": {
          "type": "string",
          "format": "datetime"
        },
        "updatedAt": {
          "type": "string",
          "format": "datetime",
          "description": "The tie-breaker when two records claim home."
        }
      }
    }
  },
  "row": {
    "type": "object",
    "required": [
      "kind",
      "on",
      "weight"
    ],
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "timeline",
          "feed",
          "list",
          "hashtag"
        ],
        "description": "Which subscription this row is. timeline needs no uri or tag; feed and list carry the generator's or list's at-uri; hashtag carries the bare tag."
      },
      "uri": {
        "type": "string",
        "format": "at-uri",
        "description": "For feed and list: the app.bsky.feed.generator or app.bsky.graph.list record."
      },
      "tag": {
        "type": "string",
        "minLength": 1,
        "maxLength": 640,
        "description": "For hashtag: the tag, bare and lowercase, as fyi.forage.tagsub stores it."
      },
      "on": {
        "type": "boolean",
        "description": "Off is not fetched. The weight is kept while off, so the row comes back where the reader left it."
      },
      "weight": {
        "type": "string",
        "enum": [
          "less",
          "normal",
          "more"
        ],
        "description": "How much of this source in the mix: a share of the deal on the default sort, a factor on the score under Top and Hot, nothing under New. Words rather than a number, so the vocabulary is the schema's and a fourth notch is a word added, never a number invented."
      }
    }
  }
});
