// W12 — the host sheet: choosing a server, and an intent (plan 2026-08-26-3, Phase C).
//
// Forage has no accounts of its own. Every identity belongs to a server someone
// else runs, so the front door's job is to route you to one — and a client that
// says "Sign in with Bluesky" and nothing else teaches a newcomer that atproto
// is one company's product. The sheet teaches the shape of the network by
// showing it: two servers with open signups, one that requires an invite, and a
// way in to any other.
//
// This is the WIRING test in the plan's sense: it drives a real click in the
// running app and asserts what reached the session manager. A sheet whose rows
// are only unit-tested is the exact dead component the plan's Pass 3 named.
//
// Four things asserted here that "the dialog opens" does not cover:
//   - the INTENT reaches the seam. Create account must send
//     { prompt: 'create' } and Sign in must send NO options at all — an
//     options-less signIn that quietly invents a prompt would pass a test that
//     only looked at the happy path (Phase B named this edge; this is where it
//     becomes visible from the UI).
//   - BOTH postures, in both directions. An open-signup host offers creation;
//     an invite-only host offers the WORDS and no create control. A suite that
//     checks only the open direction passes against a sheet that offers
//     creation everywhere.
//   - the cap is real. On a 390px viewport the sheet nearly fills the screen,
//     so the row count is a behaviour, not a detail.
//   - signed IN it does not exist. Not hidden — absent, trigger included.
//
// A failure here is read WITH diagnoseLive()'s output (the runner prints it),
// not from the stack alone.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { HOSTS, featuredHosts, otherHosts, SIGNUP } from '../js/auth/hosts.js';

// A manager that RECORDS instead of redirecting. signIn never resolves, which
// is what a real authorize redirect looks like from the page's point of view:
// the navigation happens, nothing after the call runs.
const RECORDING = `(() => {
  const listeners = new Set(); let state = 'signed-out';
  window.__signInCalls = [];
  window.__forageFakeSessionManager = {
    state: () => state,
    currentSession: () => null,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() { state = 'signed-out'; for (const f of listeners) f(state); return null; },
    async signIn(handle, options) {
      window.__signInCalls.push({ handle, options: options === undefined ? null : options });
      return new Promise(() => {});
    },
    async signOut() {},
    fetch() { return Promise.reject(new Error('signed out')); },
  };
})();`;

const SIGNED_IN = `(() => {
  const listeners = new Set(); let session = null; let state = 'unknown';
  window.__forageFakeSessionManager = {
    state: () => state, currentSession: () => session,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    async restore() {
      session = { did: 'did:plc:me', signOut: async () => {},
        fetchHandler: (p, i) => window.fetch('https://bsky.social' + p, i) };
      state = 'signed-in'; for (const f of listeners) f(state); return session;
    },
    async signIn() {}, async signOut() {},
    fetch(p, i) { return session.fetchHandler(p, i); },
  };
})();`;

const RESPONSES = {
  'getTrendingTopics': { topics: [] },
  'getPreferences': { preferences: [] },
  'describeRepo': { handle: 'me.test' },
  'getFeed?': { feed: [] },
  'getQuotes': { posts: [] },
};

// 2026-08-29 (owner): the front page is the OPEN hosts; invite-only hosts sit
// on the "Another server" panel with the handle field. Both lists come from
// the registry so this workflow cannot agree with a stale picture of it.
const OPEN = featuredHosts();
const INVITE = otherHosts();

// `within` scopes the read to one panel, because a row that is in the DOM but
// on the wrong panel would otherwise count as present.
const rows = (page, within = 'dialog[data-auth-sheet]') => page.evaluate((sel) =>
  [...document.querySelectorAll(`${sel} [data-host-row]`)].map((r) => ({
    id: r.getAttribute('data-host-row'),
    create: !!r.querySelector('[data-host-create]'),
    signin: !!r.querySelector('[data-host-signin]'),
    visible: r.getClientRects().length > 0,
    text: r.innerText.replace(/\s+/g, ' ').trim(),
  })), within);

const open = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog[data-auth-sheet]');
  return d ? d.open : null;
});

export async function run() {
  assert.ok(OPEN.length && INVITE.length,
    'this workflow asserts BOTH postures; the registry must carry at least one of each');

  const s = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [RECORDING], responses: RESPONSES });
  try {
    await s.page.setViewportSize({ width: 390, height: 844 });
    await s.page.goto(`${s.origin}/`);
    await s.page.waitForSelector('[data-open-auth-sheet]');

    // ---- closed until asked for ------------------------------------------
    assert.equal(await open(s.page), null,
      'the sheet is not in the document until something opens it');

    // ---- a real click opens it -------------------------------------------
    await s.page.click('[data-open-auth-sheet]');
    await s.page.waitForSelector('dialog[data-auth-sheet][open]');
    assert.equal(await open(s.page), true, 'the trigger opens the sheet');

    // ---- the words (owner, 2026-08-29): "atmo provider", glossed --------
    // The gloss is a native <abbr title>, which hovers on a desktop and is read
    // by assistive tech; touch cannot hover, so the intro sentence carries the
    // same definition in plain sight and nobody depends on the tooltip.
    const words = await s.page.evaluate(() => {
      const d = document.querySelector('dialog[data-auth-sheet]');
      const abbr = d.querySelector('h2 abbr');
      return { title: d.querySelector('h2').innerText.replace(/\s+/g, ' ').trim(),
        gloss: abbr && abbr.getAttribute('title'), intro: d.querySelector('p').innerText };
    });
    assert.equal(words.title, 'Choose your atmo provider');
    assert.equal(words.gloss, 'A Personal Data Server provider in the open social Atmosphere');
    assert.match(words.intro, /Personal Data Server/, 'the definition is visible without hovering');

    // ---- the front page is the OPEN registry, capped, in order -----------
    const front = await rows(s.page, 'dialog[data-auth-sheet] > .sheet-list');
    assert.deepEqual(front.map((r) => r.id), OPEN.map((h) => h.id),
      `the front page shows the open hosts in registry order — ${HOSTS.length} known, ${OPEN.length} featured`);
    for (const h of OPEN) {
      const row = front.find((r) => r.id === h.id);
      assert.ok(row.visible, `${h.id} is on screen before anything is tapped`);
      assert.ok(row.create && row.signin,
        `${h.id} has open signups, so it offers BOTH create and sign in: ${JSON.stringify(row)}`);
    }
    for (const h of INVITE) {
      assert.ok(!front.some((r) => r.id === h.id),
        `${h.id} is invite-only and does not belong on the front page`);
    }

    // ---- invite-only hosts are BEHIND "Another server", not gone ---------
    // Rendered with the panel and hidden with it: a member of Northsky finds
    // their server one tap in, with Sign in and the words that explain the
    // missing Create — the same two-direction rule the front page used to carry.
    const before = await rows(s.page, '.sheet-other');
    assert.deepEqual(before.map((r) => r.id), INVITE.map((h) => h.id),
      'the other panel carries the invite-only hosts in registry order');
    assert.ok(before.every((r) => !r.visible), 'the other panel is hidden until asked for');
    await s.page.click('[data-host-other]');
    const other = await rows(s.page, '.sheet-other');
    for (const h of INVITE) {
      const row = other.find((r) => r.id === h.id);
      assert.ok(row.visible, `${h.id} shows once Another provider is opened`);
      assert.equal(row.create, false,
        `${h.id} is invite-only — no create control, because the button would land on a screen that asks for a code`);
      assert.ok(row.signin, `${h.id} is still somewhere you can SIGN IN`);
      assert.match(row.text, /invite only/i,
        `${h.id} says why the create control is missing, in the slot where it would have been: ${JSON.stringify(row.text)}`);
    }
    await s.page.click(`[data-host-row="${INVITE[0].id}"] [data-host-signin]`);
    assert.deepEqual(await s.page.evaluate(() => window.__signInCalls),
      [{ handle: INVITE[0].entryway, options: null }],
      'Sign in on an invite-only row starts the flow at that host, with no prompt');
    await s.page.evaluate(() => { window.__signInCalls = []; });

    // ---- it fits the narrowest phone we support --------------------------
    // W6 measures overflow and tap targets on the surfaces it visits, and it
    // never opens this — a modal is invisible to a gate that does not summon
    // it. So the sheet carries its own fit check, at the narrowest width.
    await s.page.setViewportSize({ width: 320, height: 568 });
    const fit = await s.page.evaluate(() => {
      const d = document.querySelector('dialog[data-auth-sheet]');
      return {
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
        sheetW: Math.round(d.getBoundingClientRect().width),
        small: [...d.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect();
          // Same rule W6 uses: a control that is not rendered is not a target.
          // "Another server" hides its handle field until asked, so Continue
          // measures 0x0 until it is.
          if (r.width === 0 && r.height === 0) return null;
          return (r.width < 44 || r.height < 44)
            ? `${b.textContent.trim()} ${Math.round(r.width)}x${Math.round(r.height)}` : null;
        }).filter(Boolean),
      };
    });
    assert.ok(fit.scrollW <= fit.innerW + 1,
      `the open sheet must not push the page sideways at 320px (${fit.scrollW} > ${fit.innerW})`);
    assert.ok(fit.sheetW <= 320, `the sheet stays inside the viewport: ${fit.sheetW}px`);
    assert.deepEqual(fit.small, [],
      `every control in the sheet meets the 44px touch floor at 320px: ${JSON.stringify(fit.small)}`);
    await s.page.setViewportSize({ width: 390, height: 844 });

    // ---- intent reaches the seam: create ---------------------------------
    await s.page.click(`[data-host-row="${OPEN[0].id}"] [data-host-create]`);
    assert.deepEqual(await s.page.evaluate(() => window.__signInCalls),
      [{ handle: OPEN[0].entryway, options: { prompt: 'create' } }],
      'Create account starts the flow at that host, in the create intent');
  } finally { await s.close(); }

  // ---- intent reaches the seam: plain sign-in sends NO options ----------
  const t = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [RECORDING], responses: RESPONSES });
  try {
    await t.page.goto(`${t.origin}/`);
    await t.page.waitForSelector('[data-open-auth-sheet]');
    await t.page.click('[data-open-auth-sheet]');
    await t.page.waitForSelector('dialog[data-auth-sheet][open]');
    await t.page.click(`[data-host-row="${OPEN[0].id}"] [data-host-signin]`);
    assert.deepEqual(await t.page.evaluate(() => window.__signInCalls),
      [{ handle: OPEN[0].entryway, options: null }],
      'Sign in sends no options — an options-less signIn must not invent a prompt');
  } finally { await t.close(); }

  // ---- any other server, by handle -------------------------------------
  const u = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [RECORDING], responses: RESPONSES });
  try {
    await u.page.goto(`${u.origin}/`);
    await u.page.waitForSelector('[data-open-auth-sheet]');
    await u.page.click('[data-open-auth-sheet]');
    await u.page.waitForSelector('dialog[data-auth-sheet][open]');
    await u.page.click('[data-host-other]');
    // The button that revealed the field must go away. `hidden` is an attribute
    // the UA styles at element specificity, and `.btn` sets `display`, so a
    // hidden button stays on screen — the sheet shipped that way for one build
    // and only a screenshot showed it. Asserted here because "the field
    // appeared" is true either way.
    assert.equal(await u.page.locator('[data-host-other]').isVisible(), false,
      'Another provider hides itself once it has revealed its field');
    await u.page.fill('[data-host-other-handle]', '@someone.zio.blue');
    await u.page.click('[data-host-other-go]');
    assert.deepEqual(await u.page.evaluate(() => window.__signInCalls),
      [{ handle: 'someone.zio.blue', options: null }],
      'a handle on any atproto host reaches the same seam, leading @ stripped');

    // ---- Esc closes and focus comes back to the trigger ------------------
    const backTo = await u.page.evaluate(async () => {
      const d = document.querySelector('dialog[data-auth-sheet]');
      d.close();
      await new Promise((r) => requestAnimationFrame(r));
      return document.activeElement?.matches('[data-open-auth-sheet]') ?? false;
    });
    assert.ok(backTo,
      'closing returns focus to the trigger — otherwise a keyboard visitor is dropped at the top of the document');
    assert.deepEqual(await u.shimMisses(), [],
      'the sheet reaches no host outside the fenced list');
  } finally { await u.close(); }

  // ---- signed in, it does not exist ------------------------------------
  const inn = await scenario('first-visit', {
    mode: 'bluesky', initScripts: [SIGNED_IN], responses: RESPONSES });
  try {
    await inn.page.goto(`${inn.origin}/`);
    await inn.page.waitForSelector('.masthead');
    await inn.page.waitForTimeout(400);
    assert.equal(await inn.page.locator('[data-open-auth-sheet]').count(), 0,
      'signed in there is nothing to open — the trigger is absent, not disabled');
    assert.equal(await open(inn.page), null, 'and the sheet itself is not in the document');
  } finally { await inn.close(); }
}
