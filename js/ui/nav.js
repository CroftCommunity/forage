// The left navigation — the sidebar that replaced the two-half strip.
//
// WHY IT EXISTS, since the strip it replaced was the more elegant idea: the
// strip's right half was a tab AND a menu opener, so switching to that view
// always opened a menu nobody asked for (owner, 2026-08-28: "the act of
// switching also triggers the drop down and I dont' think that's fixable in a
// sane way"). It is not fixable — one control cannot have two jobs when doing
// either requires doing both. Here every row is a link with exactly one job.
//
// WHAT IT LISTS, and why there are no "views": everything here is a BOARD — a
// list of posts — and boards differ only in where the posts come from: a feed
// generator, a hashtag, or your own graph at some reach. That taxonomy came
// from the owner noticing that "Discover" and f/whats-hot are one object in
// CURATED, not two kinds of thing. So the sections group boards by SOURCE,
// which is the only real distinction, rather than by an invented category.
//
// Signed out there is one line saying why the ring is missing. That is the
// guest-surface rule (49cf873): a control a reader cannot use is hidden rather
// than greyed. The note stayed when the ring left this file for the masthead
// pill (plan 2026-09-03) — the pill is hidden for a guest by the same rule, and
// this is still the only place the absence is explained in words.


export function navTree({ el, session, feeds, tags, current }) {
  const nav = el('nav', { class: 'nav', 'data-nav': '1', 'aria-label': 'Boards' });
  const section = (label) => nav.append(el('div', { class: 'navsec' }, label));
  const item = (id, label, ico, href) => {
    const a = el('a', { class: 'navitem', href, 'data-nav-item': id },
      el('span', { class: 'ico', 'aria-hidden': 'true' }, ico), label);
    if (current === id) a.setAttribute('aria-current', 'page');
    nav.append(a);
    return a;
  };

  // The "Your ring" section is GONE (plan 2026-09-03). Five rows here said
  // "five places to go", and the ring stopped being a destination: it is now a
  // scope over everything, set by the pill in the masthead. A nav row and a
  // pill governing the same thing would be two controls with one job, which is
  // the fault this file was written to fix — see the strip it replaced.
  //
  // The rungs remain addressable at /r/<rung> for now; what changed is that
  // they are no longer how you set your ring.

  section('Feeds');
  for (const f of feeds || []) item(f.slug, f.title, '▦', f.href || `/f/${f.slug}`);
  // v11 (owner, 2026-09-01: "remove Bluesky from the default feed on the left
  // under Discovery … and put Trending in its place"). Trending is not a second
  // copy of the row that used to sit below the rule — it MOVED. It belongs with
  // the feeds by this file's own taxonomy: the directory is a board, its posts
  // come from a source (what the network says is hot), and the rule below
  // separates boards you read from the browse surfaces that find you new ones.
  item('directory', 'Trending', '✧', '/trending');

  if (session && (tags || []).length) {
    section('Hashtags');
    // The '#' is the ROW ICON, so the label is the bare tag. Rendering both
    // gave "# #harvest" — the glyph and the label were each carrying the
    // punctuation, and neither knew about the other.
    for (const t of tags) item(`tag-${t}`, t, '#', `/h/${encodeURIComponent(t)}`);
  }

  nav.append(el('hr', { class: 'navrule' }));
  item('feeds', 'Browse all feeds', '☷', '/feeds');
  item('hashtags', 'Browse hashtags', '#', '/hashtags');

  if (!session) {
    nav.append(el('div', { class: 'navnote' },
      'Your ring — how close to you a post has to come from before you see it — '
      + 'needs your own follow graph, so it appears once you sign in.'));
  }
  return nav;
}
