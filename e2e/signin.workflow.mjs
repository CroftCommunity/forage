// W2 — the sign-in journey (2b/2c behavior at the workflow level). The fake
// session manager sits at the SAME seam production uses (initSession's
// harness hook) and mimics the real flow's shape: signIn stamps a marker and
// reloads (the authorize redirect), the next boot's restore() finds the
// session, sign-out clears it. Network reads flow through the fetch shim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenario } from './harness/scenario.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (n) => JSON.parse(readFileSync(join(root, 'test/fixtures/atproto', `${n}.json`), 'utf8'));

const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';
const AFTER_DARK = 'at://did:plc:x/app.bsky.feed.generator/afterdark';
const GARDEN = 'at://did:plc:g/app.bsky.feed.generator/gardentalk';
const FRESHEST = 'at://did:plc:i/app.bsky.feed.generator/freshest';
const LOUDEST = 'at://did:plc:h/app.bsky.feed.generator/loudest';
const GRAPHIC = 'at://did:plc:j/app.bsky.feed.generator/rough';
const RETRACTED = 'at://did:plc:k/app.bsky.feed.generator/cleared';
const enc = (uri) => encodeURIComponent(uri);
// an hour old: comfortably inside both the 7d and 30d windows 4c counts
const recentLikes = (n) => Array.from({ length: n },
  () => ({ indexedAt: new Date(Date.now() - 3600_000).toISOString() }));

const FAKE_MANAGER = `(() => {
  const KEY = 'w2.signed-in';
  let state = 'unknown';
  let session = null;
  const listeners = new Set();
  const set = (s) => { state = s; for (const fn of listeners) fn(s); };
  const mkSession = () => ({
    did: 'did:plc:w2test',
    signOut: async () => {},
    fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i),
  });
  window.__forageFakeSessionManager = {
    state: () => state,
    currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() {
      if (sessionStorage.getItem(KEY)) { session = mkSession(); set('signed-in'); return session; }
      session = null; set('signed-out'); return null;
    },
    async signIn(handle) {
      set('pending');
      sessionStorage.setItem(KEY, handle);
      location.reload(); // the authorize redirect, in miniature
      return new Promise(() => {});
    },
    async signOut() { sessionStorage.removeItem(KEY); session = null; set('signed-out'); },
    fetch(p, i) {
      if (!session) return Promise.reject(new Error('signed out'));
      return session.fetchHandler(p, i);
    },
  };
})();`;

export async function run() {
  const s = await scenario('first-visit', {
    initScripts: [FAKE_MANAGER],
    responses: {
      'resolveHandle': { did: 'did:plc:x' },
      'describeRepo': { did: 'did:plc:w2test', handle: 'wtest.bsky.social', didDoc: {}, collections: [] },
      // 3x: signing in warms the mutuals ring in the background, so the graph
      // is read here now — the journey declares it rather than hiding it.
      'getFollows': { follows: [] },
      'getFollowers': { followers: [] },
      'getPreferences': { preferences: [{ $type: 'app.bsky.actor.defs#savedFeedsPrefV2',
        items: [{ type: 'feed', value: WHATS_HOT, pinned: false, id: '1' }, // 3s: joined, not favorited
                // 4a: joined BEFORE adult content was off — membership is not
                // consent, so it must still leave the sidebar.
                { type: 'feed', value: AFTER_DARK, pinned: true, id: '3' },
                { type: 'timeline', value: 'following', pinned: true, id: '2' }] }] },
      'getFeedGenerators': { feeds: [
        { uri: WHATS_HOT, displayName: "What's Hot", likeCount: 1, labels: [] },
        { uri: AFTER_DARK, displayName: 'After Dark', likeCount: 999, labels: [{ val: 'porn' }] }] },
      'getPopularFeedGenerators': { feeds: [
        { uri: GARDEN, displayName: 'Garden Talk',
          description: 'Post with #gardening to appear here.', likeCount: 12, creator: { handle: 'grower.test' },
          did: 'did:web:skyfeed.me', indexedAt: '2024-01-01T00:00:00Z' },
        // 4b: T0 dimensions with real variety, so the sorts and the builder
        // filter have something to actually do.
        { uri: LOUDEST, displayName: 'Loudest',
          description: 'most liked', likeCount: 900, creator: { handle: 'loud.test' },
          did: 'did:web:api.graze.social', indexedAt: '2023-01-01T00:00:00Z' },
        { uri: FRESHEST, displayName: 'Freshest',
          description: 'newest', likeCount: 1, creator: { handle: 'new.test' },
          did: 'did:web:skyfeed.me', indexedAt: '2026-08-01T00:00:00Z' },
        // 4a: this account carries NO adultContentPref, which the lexicon says
        // means adult content is off. The feed must not appear in discovery
        // and its board must refuse — with no Forage-side toggle to re-reveal.
        { uri: AFTER_DARK, displayName: 'After Dark',
          description: 'adult stuff', likeCount: 999, creator: { handle: 'x.test' },
          labels: [{ val: 'porn' }] },
        // OQ5: `graphic-media` is NOT adult — the old adult switch let it
        // through. The guest floor does not.
        { uri: GRAPHIC, displayName: 'Rough Stuff',
          description: 'graphic', likeCount: 5, creator: { handle: 'g.test' },
          labels: [{ val: 'graphic-media' }] },
        // and a RETRACTED label is not a label at all
        { uri: RETRACTED, displayName: 'Cleared Feed',
          description: 'was labeled, then cleared', likeCount: 3, creator: { handle: 'c.test' },
          labels: [{ val: 'porn', neg: true }] } ] },
      'getFeedGenerator?feed=at%3A%2F%2Fdid%3Aplc%3Ax': { view: { uri: 'at://did:plc:x/app.bsky.feed.generator/afterdark',
        displayName: 'After Dark', description: 'adult stuff', likeCount: 999,
        creator: { handle: 'x.test' }, labels: [{ val: 'porn' }] }, isOnline: true, isValid: true },
      'getFeedGenerator?': { view: { uri: WHATS_HOT, displayName: "What's Hot", description: 'the hot stuff',
        likeCount: 99, creator: { handle: 'bsky.app' } }, isOnline: true, isValid: true },
      // 4c: Rising rides one getLikes per feed. The counts are deliberately
      // INVERTED against likeCount so the journey proves Rising is a different
      // ranking and not likeCount wearing a hat. Shim routing is by URL
      // substring, first match wins — so the per-feed keys precede the
      // catch-all, and each names its feed's DID inside the encoded uri param.
      [`getLikes?uri=${enc(FRESHEST)}`]: { likes: recentLikes(5) },
      [`getLikes?uri=${enc(GARDEN)}`]: { likes: recentLikes(2) },
      'getLikes': { likes: recentLikes(1) },
      // 4d: Garden Talk answers with a fresh post; Loudest answers with a
      // months-old one; Freshest refuses entirely. Shim routing is by URL
      // substring, first match wins.
      [`getFeed?feed=${enc(GARDEN)}`]: { feed: [{ post: { indexedAt: new Date(Date.now() - 3600_000).toISOString() } }] },
      [`getFeed?feed=${enc(LOUDEST)}`]: { feed: [{ post: { indexedAt: new Date(Date.now() - 900 * 3600_000).toISOString() } }] },
      // Freshest answers with nothing at all. (The `silent` state — a feed that
      // will not answer — is not reachable through the shim, which only speaks
      // 200; its unit test covers it.)
      [`getFeed?feed=${enc(FRESHEST)}`]: { feed: [] },
      // 4g: Constellation is FENCED in the shim like every Bluesky host, so this
      // journey is hermetic. Two rows, one recent and one ancient, so the
      // week-window is exercised by the TID decode alone.
      'constellation.microcosm.blue/links?target=': { total: 4287, linking_records: [
        { rkey: '3mtyzi64agb2i' }, { rkey: '3lgwdn7vd722r' }] },
      'putPreferences': {},
      'getProfile': { did: 'did:plc:w2test', handle: 'wtest.bsky.social', displayName: 'W Tester',
        avatar: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', description: 'a test bio', followersCount: 5, followsCount: 7, postsCount: 9 },
      'getTrendingTopics': { topics: [
        { topic: 'Meadow Fest', displayName: 'Meadow Fest', description: 'campers assemble',
          link: '/profile/did:plc:trends/feed/meadow1' } ] },
      'getMutes': { mutes: [] },
      'getBlocks': { blocks: [] },
      'getListMutes': { lists: [] },
      'getListBlocks': { lists: [] },

      // 4f: the /f/ board widens by paging backwards. This feed answers with a
      // cursor, so the walk continues; the fixture's posts are old enough that
      // one more page reaches past 24h and the walk ends COVERED.
      [`getFeed?feed=${enc(WHATS_HOT)}&limit=30&cursor=`]: fixture('wide-getFeed'),
      'getFeed': { ...fixture('wide-getFeed'), cursor: 'page2' },
    },
  });
  const { page } = s;

  // signed-out: the OAuth card, no app-password field anywhere
  await page.goto(`${s.origin}/`);
  await page.waitForSelector('text=Sign in with Bluesky');
  assert.equal(await page.locator('input[type="password"]').count(), 0, 'no password field exists anymore');

  // OQ5 (owner, 2026-08-26): a LOGGED-OUT visitor gets the strictest stance —
  // bluebird's label floor, which is wider than the adult switch and admits no
  // reveal. A guest has no account to mirror, so "the safe thing" is the honest
  // default rather than "everything".
  await page.goto(`${s.origin}/feeds`);
  await page.waitForSelector('[data-discover-feed]');
  const guestTitles = await page.locator('[data-discover-feed] a[href*="/f/"]').allTextContents();
  assert.ok(!guestTitles.includes('After Dark'), 'adult: gone for a guest');
  assert.ok(!guestTitles.includes('Rough Stuff'), 'graphic-media: gone too — wider than the adult switch');
  assert.ok(guestTitles.includes('Cleared Feed'), 'a RETRACTED label is not a label — this one stays');
  assert.ok(guestTitles.includes('Garden Talk'), 'and ordinary feeds are untouched');
  // no reveal anywhere: the floor hides, it does not veil-with-a-control
  assert.equal(await page.locator('text=Show anyway').count(), 0, 'no reveal control exists');
  await page.goto(`${s.origin}/`);

  // card path: handle → button → (redirect-in-miniature) → signed-in identity
  await page.locator('input[placeholder="you.bsky.social"]').fill('wtest.bsky.social');
  await page.locator('button:has-text("Sign in with Bluesky")').click();
  await page.waitForSelector('.masthead a[title="Your Forage profile"]', { timeout: 10000 });

  // the personal surface opens: saved feeds in the sidebar; the identity and
  // moderation mirror live on /me, NOT the front page
  await page.waitForSelector('a[href="/f/whats-hot"]');
  await page.waitForSelector('a[href="/f/following"]');
  assert.equal(await page.locator('#side [data-moderation-panel]').count(), 0, 'moderation lives on /me now');

  // the masthead @handle IS the profile link
  await page.goto(`${s.origin}/`);
  await page.locator('.masthead a[title="Your Forage profile"]').click();
  await page.waitForSelector('text=@wtest.bsky.social');
  await page.waitForSelector('[data-moderation-panel]');

  // 3u: content languages live here, and the page says plainly that Bluesky
  // has no account-level language preference for us to honour (verified: no
  // lang def in app.bsky.actor.defs — DL-026).
  await page.waitForSelector('[data-lang-panel]');
  const langText = await page.locator('[data-lang-panel]').innerText();
  assert.match(langText, /Forage only|this device/i, 'the limitation is stated, not papered over');
  await page.locator('[data-lang-panel] input[value="ja"]').check();
  await page.waitForFunction(() => localStorage.getItem('forage.langs') === 'ja');
  await page.locator('[data-lang-panel] button:has-text("Show every language")').click();
  await page.waitForFunction(() => localStorage.getItem('forage.langs') === null);
  await page.waitForSelector('text=Muted words');
  // 3k: the account menu — this account listed active, add + sign out present
  await page.waitForSelector('[data-account-menu]');
  await page.waitForSelector('[data-switch-did] , button:has-text("(active)")');
  await page.waitForSelector('button:has-text("+ Add another account")');

  // 3j: feed discovery — /feeds lists generators, searchable, each linkable
  await page.goto(`${s.origin}/feeds`);
  await page.waitForSelector('[data-discover-feed]');
  await page.waitForSelector('text=Garden Talk');
  // 3v: the link discovery hands out is the SHAREABLE one — creator-qualified,
  // so pasting it works for someone who has never opened Forage.
  const shared = await page.locator('[data-discover-feed] a').first().getAttribute('href');
  assert.match(shared, /^\/f\/@[^/]+\/[^/]+$/, `discovery links carry the creator, got ${shared}`);
  await page.waitForSelector('text=Post with #gardening to appear here.');
  // 4a: the adult-labelled generator is absent from discovery entirely — the
  // account never enabled adult content, so the posture hides it in the shape
  // layer and no component ever sees it. There is deliberately NO toggle here.
  assert.equal(await page.locator('text=After Dark').count(), 0,
    'an adult-labelled feed does not surface for an account with adult content off');
  // OQ5's other half, and the reason the floor is guest-ONLY: signed in, the
  // account governs. This account never set a graphic-media preference, so
  // "Rough Stuff" — which the GUEST floor hid a moment ago — is visible here.
  // Adult stays hidden because the lexicon's own default is off.
  const signedInTitles = await page.locator('[data-discover-feed] a[href*="/f/"]').allTextContents();
  assert.ok(!signedInTitles.includes('After Dark'), 'adult stays hidden: the lexicon default is off');
  assert.ok(signedInTitles.includes('Rough Stuff'),
    'graphic-media returns once there is an account to mirror — the floor is a GUEST default, not a policy we impose');
  assert.equal(await page.locator('[data-discover-feed]').count(), 5);
  assert.equal(await page.locator('input[type="checkbox"]:near(:text("adult"))').count(), 0,
    'discovery offers no adult toggle of its own — the account setting is the only source of truth');

  // 4b: the whole popular corpus is loaded, so the controls describe all of it
  await page.waitForSelector('[data-feed-controls]');
  await page.waitForSelector('text=All 5 feeds Bluesky lists as popular.');
  const titles = async () => page.locator('[data-discover-feed] a[href^="/f/"]').allTextContents();
  assert.deepEqual(await titles(), ['Garden Talk', 'Loudest', 'Freshest', 'Rough Stuff', 'Cleared Feed'],
    'the default is Bluesky\'s own order, untouched');

  await page.locator('[data-feed-sort]').selectOption('likes');
  assert.deepEqual((await titles()).slice(0, 2), ['Loudest', 'Garden Talk']);
  await page.locator('[data-feed-sort]').selectOption('new');
  assert.equal((await titles())[0], 'Freshest');

  // 4c: Rising is a DIFFERENT ranking — 7d likes here are inverted against
  // all-time likeCount, so if Rising were secretly likeCount this would fail.
  await page.locator('[data-feed-sort]').selectOption('rising7');
  await page.waitForSelector('text=likes in 7d');
  await page.waitForFunction(() => !document.body.textContent.includes('measuring…'));
  assert.deepEqual((await titles()).slice(0, 3), ['Freshest', 'Garden Talk', 'Loudest'],
    'Rising ranks by the window, not by the all-time count');
  await page.waitForSelector('text=Joining a feed is private');
  assert.equal(await page.locator('text=5 likes in 7d').count(), 1, 'the window count is shown per feed');

  // 24h is deliberately absent: measured, only 9 of 117 feeds got >=2 likes in
  // a day, so the window would present ties-at-zero as a ranking.
  const sortOptions = await page.locator('[data-feed-sort] option').allTextContents();
  assert.deepEqual(sortOptions, ['Popular', 'Most liked', 'Rising · 7 days', 'Rising · 30 days', 'Newest', 'Oldest']);

  await page.locator('[data-feed-sort]').selectOption('new');

  // the builder facet: feeds are built ON services, and that is a real filter
  await page.locator('[data-feed-platform]').selectOption('skyfeed.me');
  assert.deepEqual(await titles(), ['Freshest', 'Garden Talk']);
  await page.waitForSelector('text=2 of 5 feeds.');
  await page.locator('[data-feed-platform]').selectOption('');

  // 4b: a search is a slice of an unbounded index, so the sorts refuse rather
  // than claim to rank everything that matched
  await page.locator('[data-feed-search]').fill('garden');
  await page.locator('button:has-text("Search")').click();
  await page.waitForSelector('text=in the order Bluesky\'s search ranked them.');
  assert.equal(await page.locator('[data-feed-sort]').isDisabled(), true,
    'sorting a search slice would misrepresent it as a ranking of the whole index');

  // 4d: on SEARCH, inactive feeds are hidden by default — a third of search
  // results are dead or stale. The drop is stated, never silent, and a feed
  // that would not answer is reported as that, not as dead.
  assert.equal(await page.locator('[data-feed-alive]').isChecked(), true,
    'hide-inactive defaults ON for search');
  await page.waitForSelector('text=1 stale');
  await page.waitForSelector('text=1 empty');
  const alive = await titles();
  assert.ok(alive.includes('Garden Talk'), 'the feed with a fresh post survives');
  assert.ok(!alive.includes('Loudest'), 'the stale one is filtered');
  assert.ok(!alive.includes('Freshest'), 'so is the empty one');

  // unchecking brings them back — it is a filter the user controls
  await page.locator('[data-feed-alive]').uncheck();
  const all = await titles();
  assert.ok(all.includes('Loudest') && all.includes('Freshest'), 'unchecking restores them');

  // 4a: it is gone from the sidebar too, even though the account JOINED it —
  // membership does not override the account's moderation setting.
  assert.equal(await page.locator('.side >> text=After Dark').count(), 0,
    'a joined adult feed does not appear in Fields');

  // 4a: and its board never paints. A BARE slug never registers (nothing that
  // survives the posture can register it), so that link lands on the
  // unknown-feed state without leaking the feed's content or name.
  await page.goto(`${s.origin}/f/afterdark`);
  await page.waitForSelector('text=Unknown feed');
  assert.equal(await page.locator('[data-board-toolbar]').count(), 0, 'no board painted');
  assert.equal(await page.locator('text=adult stuff').count(), 0, 'no description leaks either');

  // 4a x 3v: the QUALIFIED link is the one that cold-resolves, so it reaches
  // the board without ever passing through discovery — which is exactly why
  // the board carries its own moderation gate. It must refuse here.
  await page.goto(`${s.origin}/f/@x.test/afterdark`);
  await page.waitForSelector('text=hidden by your moderation settings');
  assert.equal(await page.locator('[data-board-toolbar]').count(), 0,
    'a cold-resolved adult feed paints no board');
  assert.equal(await page.locator('text=adult stuff').count(), 0, 'and leaks no description');

  // Phase-1 live-proof finding: a session-gated control must never swallow a
  // click. Signed OUT it says sign in and names the action; while the session
  // is still RESTORING it says wait — the two are different situations, and
  // conflating them is what made a real Reply click vanish silently.
  const gateWords = await page.evaluate(async () => {
    const m = await import('/js/substrates/lens.js');
    return {
      restoring: m.sessionGateMessage({ signedIn: false, authState: 'unknown' }, 'reply'),
      out: m.sessionGateMessage({ signedIn: false, authState: 'signed-out' }, 'reply'),
      inSession: m.sessionGateMessage({ signedIn: true, authState: 'signed-in' }, 'reply'),
    };
  });
  assert.match(gateWords.restoring, /restor/i, 'a restoring session says wait, not "sign in"');
  assert.match(gateWords.out, /sign in.*reply/i, 'signed out names the action');
  assert.equal(gateWords.inSession, null);

  // 3j: a feed board carries its header card, and Join writes preferences
  await page.goto(`${s.origin}/f/whats-hot`);
  await page.waitForSelector('[data-feed-header]');
  await page.waitForSelector('text=Curated by @bsky.app.');
  // 4g: the feed card carries adoption signals the AppView does not have —
  // shares (posts quoting this feed) and starter-pack inclusions, both
  // windowed from the backlink rkeys alone.
  await page.waitForSelector('[data-adoption="shown"]');
  const adoption = await page.locator('[data-adoption]').textContent();
  assert.match(adoption, /4\.3k shares|4287 shares/, `got: ${adoption}`);
  assert.match(adoption, /starter pack/, `got: ${adoption}`);

  // 4f: Top + a window on a /f/ board pages BACKWARDS on a budget and reports
  // which of the three ways it ended — covered, exhausted, or out of budget.
  // A generator has no server window (DL-028), so this is the honest substitute.
  await page.locator('[data-board-toolbar] select').first().selectOption('top');
  await page.waitForSelector('[data-deepen]');
  await page.waitForFunction(() => {
    const t = document.querySelector('[data-deepen]')?.textContent || '';
    return t && !t.includes('Widening');
  });
  const verdict = await page.locator('[data-deepen]').textContent();
  assert.ok(/ranked|goes back|faster than we can page/i.test(verdict),
    `the board says how the widening ended, got: ${verdict}`);
  // the distinction from /h/: a /f/ board NEVER claims whole-corpus scope. It
  // either carries the loaded-window caveat or says nothing fell in the window
  // — but the server-ranked note belongs only to the surface that earned it.
  assert.equal(await page.locator('[data-whole-corpus]').count(), 0,
    'a /f/ board never claims the whole-corpus scope /h/ has');
  const board = await page.locator('#main, main, body').first().innerText();
  assert.ok(/Sorted within the loaded posts|Nothing in the loaded posts/.test(board),
    'it says which posts it ranked, one way or the other');
  await page.locator('[data-board-toolbar] select').first().selectOption('feed');

  // 3s: Favorite is its own control — pinning is the top row of the official
  // app, joining is the list. Forage must not conflate them.
  const star = page.locator('[data-feed-favorite]');
  assert.equal(await star.count(), 1, 'the feed page offers a favorite');
  assert.equal(await star.getAttribute('aria-pressed'), 'false', 'a joined-but-unpinned feed is not a favorite');
  await star.click();
  await page.waitForFunction(() => window.__shimHits.filter((h) => h.url.includes('putPreferences')).length >= 1);
  const favBody = JSON.parse(await page.evaluate(() =>
    window.__shimHits.filter((h) => h.url.includes('putPreferences')).at(-1).body));
  const favPref = favBody.preferences.find((p) => p.$type.includes('savedFeedsPrefV2'));
  assert.equal(favPref.items.find((i) => i.value.includes('whats-hot')).pinned, true,
    'favoriting pins the entry — and leaves it saved');
  await page.waitForSelector('[data-feed-favorite][aria-pressed="true"]');

  const joinBtn = page.locator('[data-feed-header] button.btn.sm:not([data-feed-favorite])');
  assert.equal(await joinBtn.innerText(), 'Leave', 'an already-saved feed offers Leave');
  await joinBtn.click();
  // .at(-1): the favorite above already wrote once — read the LATEST write
  await page.waitForFunction(() => window.__shimHits.filter((h) => h.url.includes('putPreferences')).length >= 2);
  const putBody = await page.evaluate(() => JSON.parse(window.__shimHits.filter((h) => h.url.includes('putPreferences')).at(-1).body));
  const savedPref = putBody.preferences.find((p) => p.$type.includes('savedFeedsPrefV2'));
  assert.ok(!savedPref.items.some((i) => i.value.includes('whats-hot')), 'leaving removed it from saved feeds');

  // sign out lives on the profile now — go there, then out
  await page.goto(`${s.origin}/me`);
  await page.waitForSelector('button:has-text("Sign out")');
  await page.locator('button:has-text("Sign out")').click();
  await page.waitForSelector('text=Sign in with Bluesky', { timeout: 10000 });

  // the masthead direct path: no local form — straight to the entryway (the
  // fake manager stamps and reloads, same shape as the real redirect)
  await page.locator('.masthead .who a:has-text("Sign in")').click();
  await page.waitForSelector('.masthead a[title="Your Forage profile"]', { timeout: 10000 });

  assert.deepEqual(await s.shimMisses(), [], 'every network read had a fixture');
  await s.close();
}
