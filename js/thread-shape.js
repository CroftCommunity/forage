// How deep a thread arrives — two reader settings, both device-local.
//
// Owner, 2026-09-03, on the thread-depth mock: "everything else looks good for
// A+B, but I think the settings should be adjustable for the user in advanced
// on their profile." Decision 2 on plans/mocks/thread-depth.html was about two
// numbers, and the honest answer to "which number" is that the reader picks.
//
// Two settings, because they answer different questions:
//
//   FLATTEN — where a chain of single replies stops indenting. A width
//             question, which is why `auto` is a real answer and the default:
//             it means the phone and the desktop each use their own threshold
//             (css/app.css), and a phone runs out of column two levels sooner
//             than a desktop does. A fixed number here overrides both.
//   FOLD    — how deep the thread arrives OPEN. A scroll question, and the
//             same everywhere, so there is nothing for `auto` to mean.
//
// The stylesheet owns the flatten numbers: apply() writes the choice onto the
// root as `data-flatten` and css/app.css maps each value to its depths. Nothing
// here knows a pixel — card-size.js's pattern, for the same reason it has it.
// The fold is read by the renderer (js/ui/components.js) because a fold is a
// decision about what to draw, and CSS cannot count.
//
// Device-local, like the skin, the density and the card size; never account
// state. A corrupt value reads as NO choice and says so once (card-size's rule,
// Pass 3 observability): a preference must never produce a broken thread.

export const FLATTEN_KEY = 'forage.threadflatten';
export const FOLD_KEY = 'forage.threadfold';

// value -> the words on the dial. `auto` and `off` are the two ends; the
// numbers in between are "the reply at this level is the last one indented".
export const FLATTEN_CHOICES = Object.freeze([
  ['auto', 'Auto — by screen width'],
  ['1', 'After level 1'],
  ['2', 'After level 2'],
  ['4', 'After level 4'],
  ['6', 'After level 6'],
  ['off', 'Never — always indent'],
]);
export const FOLD_CHOICES = Object.freeze([
  ['3', 'Deeper than 3 levels'],
  ['5', 'Deeper than 5 levels'],
  ['8', 'Deeper than 8 levels'],
  ['off', 'Never fold'],
]);
export const FLATTEN_DEFAULT = 'auto';
export const FOLD_DEFAULT = '5';

const valid = (choices, v) => choices.some(([id]) => id === v);
const warned = new Set();
const read = (key, choices, dflt) => {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch { return dflt; }
  if (raw === null || raw.trim() === '') return dflt;
  if (valid(choices, raw)) return raw;
  const at = `${key}:${raw}`;
  if (!warned.has(at)) { warned.add(at); console.warn(`forage: ${key} ${JSON.stringify(raw)} is not a choice; reading as ${dflt}`); }
  return dflt;
};

export function flatten() { return read(FLATTEN_KEY, FLATTEN_CHOICES, FLATTEN_DEFAULT); }
export function fold() { return read(FOLD_KEY, FOLD_CHOICES, FOLD_DEFAULT); }

// The depth at or past which a comment hands its replies over folded.
// `off` is Infinity and not a magic large number: a thread ten deep and a
// thread a hundred deep both mean "never", and a sentinel would eventually be
// reached by one of them.
export function foldAt() {
  const v = fold();
  return v === 'off' ? Infinity : Number(v);
}

export function setFlatten(v) {
  if (!valid(FLATTEN_CHOICES, v)) throw new Error(`flatten must be one of ${FLATTEN_CHOICES.map(([id]) => id).join(', ')}, got ${JSON.stringify(v)}`);
  try { localStorage.setItem(FLATTEN_KEY, v); } catch { /* private mode: the thread still reads */ }
}

export function setFold(v) {
  if (!valid(FOLD_CHOICES, v)) throw new Error(`fold must be one of ${FOLD_CHOICES.map(([id]) => id).join(', ')}, got ${JSON.stringify(v)}`);
  try { localStorage.setItem(FOLD_KEY, v); } catch { /* private mode: the thread still reads */ }
}

export function clear() {
  try { localStorage.removeItem(FLATTEN_KEY); localStorage.removeItem(FOLD_KEY); } catch { /* nothing to forget */ }
}

// Explicit even at the default, so a stylesheet rule keyed on the attribute
// never has to guess what "unset" means (card-size.js's rule).
export function apply() {
  document.documentElement.setAttribute('data-flatten', flatten());
}
