// The codec for fyi.forage.feedindex — plan 2026-09-21 own-index-on-the-pds,
// Phase 1. The record a reader's OWN discovery index source travels as: the
// index file itself as a blob in their repo, or an https link to one, plus
// whether it lays over Forage's shipped index (add) or replaces it. One per
// repo, keyed `self` (D3). Forage's own index is never in it.
//
// Pure. It holds the two rules the lexicon cannot say and the reader depends
// on: exactly ONE of file / url, and it must be the one `kind` names; and a
// link is https only — a lexicon `uri` admits any scheme (spec), so the rule
// lives here and is enforced both ways, because another client may write
// anything and the reader is the only place it can be caught (LEXICONS.md § 4).
// The schema itself is consulted through js/lexicon.js against the pinned copy,
// so the one ceiling on the file (D7) is read from the schema, never restated.
import { FEEDINDEX_RECORD } from './lexicons.js';
import { validateRecord } from './lexicon.js';

export const FEEDINDEX_COLLECTION = 'fyi.forage.feedindex';
export const FEEDINDEX_RKEY = 'self';
/** The one ceiling — the blob's maxSize; also bounds a pasted file and a fetched link. */
export const INDEX_BYTES_MAX = FEEDINDEX_RECORD.properties.file.maxSize;

/** Why a link cannot be used, in words, or null when it can. */
export function indexUrlProblem(url) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return `${JSON.stringify(url ?? '')} is not a link — a link starts with https://`; }
  if (u.protocol !== 'https:') return `only https links are fetched — ${url} is ${u.protocol.slice(0, -1)}`;
  return null;
}

function oneOfProblem(kind, file, url) {
  if (file !== undefined && url !== undefined) return 'a record carries the file OR a link, not both';
  if (kind === 'file' && file === undefined) return 'kind is file but there is no file';
  if (kind === 'url' && url === undefined) return 'kind is url but there is no url';
  return null;
}

function check(record) {
  const v = validateRecord(FEEDINDEX_RECORD, record);
  if (!v.ok) throw new Error(`feedindex: ${v.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
  const one = oneOfProblem(record.kind, record.file, record.url);
  if (one) throw new Error(`feedindex: ${one}`);
  if (record.kind === 'url') {
    const bad = indexUrlProblem(record.url);
    if (bad) throw new Error(`feedindex: ${bad}`);
  }
}

/** Build the record to write. `createdAt` is kept on an edit; `updatedAt` is `now`. Throws with words. */
export function toRecord({ kind, blob, url, mode, name, createdAt, now = new Date().toISOString() }) {
  const record = {
    $type: FEEDINDEX_COLLECTION,
    kind,
    ...(blob !== undefined ? { file: blob } : {}),
    ...(url !== undefined ? { url } : {}),
    mode,
    ...(name ? { name } : {}),
    createdAt: createdAt || now,
    updatedAt: now,
  };
  check(record);
  return record;
}

/** Read a record from a repo. Throws with words on anything malformed; unknown fields are ignored. */
export function fromRecord(value) {
  // no guard for a non-object here: validateRecord already refuses one with words
  check(value);
  return {
    kind: value.kind,
    blob: value.file ?? null,
    url: value.url ?? null,
    mode: value.mode,
    name: value.name ?? null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
