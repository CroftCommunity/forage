// Which sections of /hashtags a reader wants to see. Device-local, all on by
// default, and the control lives behind an ADVANCED disclosure.
//
// The three sections answer three different questions (plan 2026-08-28-1), and
// not everyone wants all three: a reader who never looks past their own
// reading has no use for a network barometer, and one using Forage to find new
// corners may not care what they already loaded. So the page is composable.
//
// WHY ADVANCED, AND COLLAPSED. This is a setting most readers should never
// need to touch, on the page they visit to change their skin. Putting it in the
// open costs every reader attention to serve a few; putting it behind a
// disclosure costs the few one click. `<details>`/`<summary>` does that
// natively — keyboard, screen reader and all — which is why the view uses the
// element rather than building a toggle.
//
// STORED AS EXCLUSIONS, not as a list of what is on. An unset preference then
// means "everything", so a reader who never opens this never has an opinion
// recorded, and a section added LATER appears for them instead of being
// invisible because it was not in a list written before it existed.

export const HASHTAG_SECTIONS = Object.freeze([
  ['search', 'Find a hashtag'],
  ['trending', 'Trending now'],
  ['loaded', 'Hashtags loaded'],
]);
const IDS = HASHTAG_SECTIONS.map(([id]) => id);
export const SECTION_PREFS_KEY = 'forage.hashtagsections';

function readHidden() {
  try {
    const raw = localStorage.getItem(SECTION_PREFS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    // A corrupt or unexpected value reads as "hide nothing". The safe direction
    // is showing too much: a blank page nobody chose is the worse failure.
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id) => IDS.includes(id)));
  } catch { return new Set(); }
}

export function sectionEnabled(id) {
  if (!IDS.includes(id)) return false; // asking about a section that does not exist is false, not true
  return !readHidden().has(id);
}

export function setSectionEnabled(id, on) {
  if (!IDS.includes(id)) return; // refuse rather than store a key nothing reads
  const hidden = readHidden();
  if (on) hidden.delete(id); else hidden.add(id);
  try { localStorage.setItem(SECTION_PREFS_KEY, JSON.stringify([...hidden])); } catch { /* private mode */ }
}

// In PAGE order, never in the order they were toggled — the setting chooses
// what appears, not how it is arranged.
export function enabledSections() { return IDS.filter((id) => sectionEnabled(id)); }
