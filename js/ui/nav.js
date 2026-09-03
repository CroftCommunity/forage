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
// THE GUEST SURFACE (49cf873): a control a reader cannot use is hidden rather
// than greyed, because hiding three of four rungs left a list of one, which
// reads as broken. The ring pill is the standing EXCEPTION — it is drawn signed
// out, locked to World — and the exception is spelled out at the control
// itself, further down. The note at the bottom of this file explains in words
// what the locked stops need.


import * as ringScope from '../ring-scope.js';

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

  // "Your ring" keeps its place at the top of the nav and loses its five rows.
  // The rows said "five places to go"; the ring is not a destination any more,
  // it is a scope over everything, so one control stands where the list stood.
  //
  // IN THE SIDEBAR rather than the masthead (owner, 2026-09-03: "I was figuring
  // the pill would go in the left side bar at the top"). It replaced the
  // section in place, which is where a reader already looks for it — and it
  // fixes a duplicate the owner spotted in the mock: with the site-wide pill
  // under the masthead, a thread showed two identical pills stacked, its own
  // above the head card and the site's directly above that. The sidebar is a
  // drawer on a phone, so on a thread the thread's pill is now the only one on
  // screen; changing your site-wide ring there means opening the drawer, which
  // is exactly what setting it cost when it was five rows.
  //
  // The rungs remain addressable at /r/<rung>; what changed is that they are no
  // longer how you set your ring.
  //
  // Signed out the pill is STILL DRAWN, with World selected and the tighter
  // stops disabled (owner, 2026-09-03: "on logged out I still want the pill but
  // only world is selectable and selected"). That is a deliberate exception to
  // the guest-surface rule two paragraphs up, and the rule's own reasoning is
  // what allows it: it exists so a control does not sit there absorbing clicks,
  // and a locked segment absorbs nothing while showing a signed-out reader that
  // scoping exists at all. The old five rows could not do this — five rows
  // minus the four you cannot use is a list of one, which reads as broken. One
  // control with two quiet segments reads as a control. It is the ONLY
  // exception in this file, which is why it is stated once, here, at the
  // control rather than in the header.
  section('Your ring');
  const pill = ringScope.ringPill(el, {
    block: true,
    locked: !session,
    ariaLabel: 'How close — what you see is scoped to this',
    onPicked: (id) => ringScope.setScope(id),
  });
  if (pill) nav.append(el('div', { class: 'navring' }, pill));

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
      'Your ring is how close to you a post has to come from before you see it. '
      + 'World shows everything; the tighter stops are computed from your own '
      + 'follow graph, so they need an account.'));
  }
  return nav;
}
