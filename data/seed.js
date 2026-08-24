// Seed scenario (spec §8). One scripted log (~70 events) plus one generated
// ~1,000-comment stress thread. Deterministic: the tree uses a seeded PRNG with a
// fixed constant, resolved at replay. Timestamps are offsets from build time.

import { mulberry32, powInt, SEED_CONST } from '../js/prng.js';

const U = {
  wren: 'u_wren', sage: 'u_sage', briar: 'u_briar', fern: 'u_fern',
  moss: 'u_moss', thorn: 'u_thorn', aspen: 'u_aspen', dove: 'u_dove',
};

export function buildSeed() {
  const now = Date.now();
  const E = [];
  let clock = now - 42 * 24 * 3600 * 1000; // start ~6 weeks back
  const tick = (ms = 1500) => (clock += ms);

  // ev(type, payload, actor, ts?) — ts defaults to a forward-marching clock.
  const ev = (type, payload, actor, ts) => {
    E.push({ id: `sd_${E.length}`, type, actor: actor ?? null, ts: ts ?? tick(), payload });
  };
  const minAgo = (m) => now - m * 60000;
  const dayAgo = (d) => now - d * 24 * 3600 * 1000;

  // synthetic voters — no user record needed; tally just counts values.
  let sv = 0;
  const votes = (subjectType, subjectId, up, down, ts) => {
    for (let i = 0; i < up; i++) ev('vote.set', { subjectType, subjectId, value: 1 }, `sv_${sv++}`, (ts || clock) + i);
    for (let i = 0; i < down; i++) ev('vote.set', { subjectType, subjectId, value: -1 }, `sv_${sv++}`, (ts || clock) + up + i);
  };

  // ---------- accounts (spec §7) ----------
  ev('account.registered', { handle: 'admin.wren',    email: 'wren@forage.fyi' },   U.wren,  dayAgo(400));
  ev('account.registered', { handle: 'owner.sage',    email: 'sage@forage.fyi' },   U.sage,  dayAgo(360));
  ev('account.registered', { handle: 'steward.briar', email: 'briar@forage.fyi' },  U.briar, dayAgo(300));
  ev('account.registered', { handle: 'member.fern',   email: 'fern@forage.fyi' },   U.fern,  dayAgo(210));
  ev('account.registered', { handle: 'heavy.aspen',   email: 'aspen@forage.fyi' },  U.aspen, dayAgo(280));
  ev('account.registered', { handle: 'banned.thorn',  email: 'thorn@forage.fyi' },  U.thorn, dayAgo(150));
  ev('account.registered', { handle: 'pristine.dove', email: 'dove@forage.fyi' },   U.dove,  dayAgo(90));
  ev('account.registered', { handle: 'newbie.moss',   email: 'moss@forage.fyi' },   U.moss,  dayAgo(3)); // probation by age

  // ---------- fields ----------
  const F = { gardening: 'f_gardening', urbanism: 'f_urbanism', retro: 'f_retro', slow: 'f_slow', meta: 'f_meta' };
  ev('field.created', { id: F.gardening, slug: 'gardening', title: 'Gardening',
    description: 'Growing things, indoors and out. Tag every post.',
    settings: { requireTags: true, rules: [
      { id: 'g1', title: 'Be kind to novices', body: 'Everyone starts somewhere.' },
      { id: 'g2', title: 'No unlabeled selling', body: 'Vendors must tag [vendor].' },
      { id: 'g3', title: 'Tag your post', body: 'Untagged posts are held.' },
    ], automod: [ { id: 'am1', match: 'buy now', action: 'hold', reason: 'possible spam' } ] } }, U.sage, dayAgo(360));
  ev('field.created', { id: F.urbanism, slug: 'urbanism', title: 'Urbanism',
    description: 'Cities, transit, and the shape of streets.' }, U.aspen, dayAgo(280));
  ev('field.created', { id: F.retro, slug: 'retrocomputing', title: 'Retrocomputing',
    description: 'Machines that refuse to die.' }, U.thorn, dayAgo(150));
  ev('field.created', { id: F.slow, slug: 'slowcooking', title: 'Slow Cooking',
    description: 'Low, slow, and worth the wait.' }, U.fern, dayAgo(120));
  ev('field.created', { id: F.meta, slug: 'meta', title: 'Meta',
    description: 'Site announcements from the Forage team.' }, U.wren, dayAgo(400));

  // ---------- stewardship + memberships ----------
  ev('mod.stewardAdded', { fieldId: F.gardening, userId: U.briar, reason: 'Trusted contributor' }, U.sage, dayAgo(120));
  // fern joined 4 Fields (default reader seat, §7)
  for (const f of [F.gardening, F.urbanism, F.retro, F.slow]) ev('field.joined', { fieldId: f }, U.fern);
  ev('field.joined', { fieldId: F.gardening }, U.aspen);
  ev('field.joined', { fieldId: F.urbanism }, U.aspen);
  ev('field.joined', { fieldId: F.gardening }, U.briar);
  ev('field.joined', { fieldId: F.retro }, U.briar);
  ev('field.joined', { fieldId: F.gardening }, U.moss);
  ev('field.joined', { fieldId: F.retro }, U.thorn);
  ev('field.joined', { fieldId: F.meta }, U.wren);

  // ---------- content variety (§8) ----------
  // pinned announcement (gardening)
  const pPin = 'p_pin';
  ev('post.created', { id: pPin, fieldId: F.gardening, format: 'text', tagId: 'announce',
    title: 'Welcome to Gardening — read the rules before posting', nsfw: false, spoiler: false,
    bodyMd: 'New here? Tag every post, be kind to novices, and check the wiki before asking about tomatoes for the ninth time this week. Happy growing.' }, U.sage, minAgo(60 * 24 * 20));
  ev('mod.pinned', { subjectType: 'post', subjectId: pPin, reason: 'Community rules' }, U.sage);
  votes('post', pPin, 142, 6);

  // long text post that truncates at the 4-line clamp
  const pLong = 'p_long';
  ev('post.created', { id: pLong, fieldId: F.gardening, format: 'text', tagId: 'guide',
    title: 'A full-season log of my raised-bed soil experiment (very long)', nsfw: false, spoiler: false,
    bodyMd: 'This spring I ran a controlled comparison across six raised beds, varying compost ratio, cover-crop history, and irrigation cadence. Bed one received a 3:1 topsoil-to-compost mix with a winter rye cover turned under in March. Bed two used the same ratio but no cover crop. Bed three doubled the compost. Bed four introduced biochar at five percent by volume. Bed five was my control, untouched from last year. Bed six got weekly compost tea. What follows is the week-by-week yield, the pest pressure I logged, the moisture readings at dawn, and every mistake I made so you do not have to repeat them. It is long. Grab tea.' },
    U.aspen, minAgo(60 * 30));
  votes('post', pLong, 88, 9);

  // link post with domain display + a scripted DUPLICATE
  const pLink = 'p_link';
  ev('post.created', { id: pLink, fieldId: F.urbanism, format: 'link',
    title: 'The case for narrower streets (study)', url: 'https://example.org/narrow-streets-study',
    nsfw: false, spoiler: false }, U.aspen, minAgo(60 * 14));
  votes('post', pLink, 63, 4);
  const pDupe = 'p_dupe';
  ev('post.created', { id: pDupe, fieldId: F.urbanism, format: 'link',
    title: 'Narrow streets study (great read)', url: 'https://example.org/narrow-streets-study',
    nsfw: false, spoiler: false }, U.fern, minAgo(60 * 3));
  votes('post', pDupe, 4, 1);

  // NSFW-flagged
  const pNsfw = 'p_nsfw';
  ev('post.created', { id: pNsfw, fieldId: F.retro, format: 'text',
    title: 'Teardown: the questionable capacitors inside a 1987 PSU', nsfw: true, spoiler: false,
    bodyMd: 'Bulging, leaking, and frankly hazardous. Photos in comments. Do not breathe this stuff in.' },
    U.thorn, minAgo(60 * 40));
  votes('post', pNsfw, 31, 2);

  // spoiler-flagged
  const pSpoil = 'p_spoil';
  ev('post.created', { id: pSpoil, fieldId: F.retro, format: 'text',
    title: 'Finished the built-in game on my restored handheld — the ending!', nsfw: false, spoiler: true,
    bodyMd: 'Spoilers inside: the final boss is the console itself. Wild.' }, U.fern, minAgo(60 * 9));
  votes('post', pSpoil, 18, 1);

  // slowcooking normal posts
  const pStew = 'p_stew';
  ev('post.created', { id: pStew, fieldId: F.slow, format: 'text',
    title: 'Eight-hour short rib — the collagen finally behaved', nsfw: false, spoiler: false,
    bodyMd: 'Low and slow at 95C. The trick was patience and a splash of fish sauce.' }, U.fern, minAgo(60 * 22));
  votes('post', pStew, 47, 3);

  // thorn posting NORMALLY in a shared Field (retro) — receiving-end ban UX check
  const pThorn = 'p_thorn';
  ev('post.created', { id: pThorn, fieldId: F.retro, format: 'text',
    title: 'Recapped my dead luggable and it POSTs again', nsfw: false, spoiler: false,
    bodyMd: 'Forty capacitors later, the amber screen lives.' }, U.thorn, minAgo(60 * 6));
  votes('post', pThorn, 22, 1);

  // meta announcement (admin-posted)
  const pMeta = 'p_meta';
  ev('post.created', { id: pMeta, fieldId: F.meta, format: 'text', title: 'Forage is in prototype. Here is what works.',
    nsfw: false, spoiler: false, bodyMd: 'Roam the open web. This build runs entirely in your browser.' }, U.wren, minAgo(60 * 50));
  votes('post', pMeta, 30, 0);

  // a LOCKED thread
  const pLocked = 'p_locked';
  ev('post.created', { id: pLocked, fieldId: F.gardening, format: 'text', tagId: 'help',
    title: 'Why are my basil leaves curling? (heated debate)', nsfw: false, spoiler: false,
    bodyMd: 'It got out of hand in the comments. Locking.' }, U.fern, minAgo(60 * 34));
  votes('post', pLocked, 26, 11);
  ev('comment.created', { id: 'c_lock1', postId: pLocked, bodyMd: 'Overwatering, obviously.' }, U.aspen);
  ev('comment.created', { id: 'c_lock2', postId: pLocked, bodyMd: 'It is clearly the light, not the water.' }, U.thorn);
  ev('mod.locked', { subjectType: 'post', subjectId: pLocked, reason: 'Thread turned uncivil' }, U.briar);

  // a post with a mod.REMOVED comment (audit entry) — visible to fern as a stub
  const pRemoved = 'p_removed';
  ev('post.created', { id: pRemoved, fieldId: F.gardening, format: 'text', tagId: 'chat',
    title: 'What did everyone plant this weekend?', nsfw: false, spoiler: false,
    bodyMd: 'Share your weekend hauls.' }, U.fern, minAgo(60 * 12));
  votes('post', pRemoved, 40, 2);
  ev('comment.created', { id: 'c_rm', postId: pRemoved, bodyMd: 'Buy discount seeds at my shop, link in bio!!!' }, U.thorn);
  ev('comment.created', { id: 'c_ok1', postId: pRemoved, bodyMd: 'Put in three tomato starts and a row of beans.' }, U.aspen);
  votes('comment', 'c_ok1', 12, 0);
  ev('comment.created', { id: 'c_fern1', postId: pRemoved, bodyMd: 'Garlic! Finally getting my beds ready for fall.' }, U.fern);
  votes('comment', 'c_fern1', 8, 0);
  ev('mod.removed', { subjectType: 'comment', subjectId: 'c_rm', reason: 'Rule 2: unlabeled selling' }, U.briar);

  // ---------- in-flight states (§7) ----------
  // 1) open report in gardening's queue (briar can action)
  ev('comment.created', { id: 'c_report', postId: pRemoved, bodyMd: 'This whole Field is a scam, mods are asleep.' }, U.moss);
  ev('report.filed', { id: 'rep_open', subjectType: 'comment', subjectId: 'c_report', fieldId: F.gardening,
    reason: 'Incivility', detail: 'Baseless accusation, breaks rule 1.' }, U.aspen);

  // 2) one unread reply for fern (reply to c_fern1, fern hasn't read)
  ev('comment.created', { id: 'c_reply_fern', postId: pRemoved, parentId: 'c_fern1',
    bodyMd: 'Fall garlic is the best decision — plant deep!' }, U.aspen);
  votes('comment', 'c_reply_fern', 5, 0);

  // 3) an automod-HELD post for sage's review (matched 'buy now')
  ev('post.created', { id: 'p_held', fieldId: F.gardening, format: 'text', tagId: 'vendor', held: true,
    title: 'Rare heirloom bulbs — buy now before the season ends', nsfw: false, spoiler: false,
    bodyMd: 'Limited stock. buy now.' }, U.moss, minAgo(60 * 2));

  // ---------- governance history (6–8 mod.*), incl. thorn's ban ----------
  ev('mod.banned', { fieldId: F.gardening, userId: U.thorn, duration: null,
    reason: 'Repeated unlabeled selling (rule 2)' }, U.briar, dayAgo(4));
  ev('mod.pinned', { subjectType: 'post', subjectId: pPin, reason: 'Rules refresh' }, U.sage, dayAgo(20));

  // ---------- heavy.aspen at the post rate limit (recent post) + saved density ----------
  const pAspenRecent = 'p_aspen_recent';
  ev('post.created', { id: pAspenRecent, fieldId: F.urbanism, format: 'text',
    title: 'Quick thought on bus bulbs vs bike lanes', nsfw: false, spoiler: false,
    bodyMd: 'Just posted this — testing the post limit.' }, U.aspen, minAgo(1)); // 1 min ago => within 5min post cooldown
  votes('post', pAspenRecent, 3, 0);
  for (const k of ['post:p_long', 'post:p_link', 'post:p_stew', 'comment:c_ok1'])
    ev('save.set', { subjectType: k.split(':')[0], subjectId: k.split(':')[1], saved: true }, U.aspen);

  // a couple of ordinary comments so threads aren't empty
  ev('comment.created', { id: 'c_long1', postId: pLong, bodyMd: 'Bed four with biochar is the surprise here. Following.' }, U.fern);
  votes('comment', 'c_long1', 14, 1);
  ev('comment.created', { id: 'c_long2', postId: pLong, parentId: 'c_long1', bodyMd: 'Biochar needs charging first or it steals nitrogen — did you soak it?' }, U.briar);
  votes('comment', 'c_long2', 9, 0);

  // a very recent, low-score gardening post: newest by far, but tiny score. It
  // tops New yet sinks under older high-score posts in Hot — so the sort toggle
  // visibly reorders the feed (acceptance §12).
  const pFresh = 'p_fresh';
  ev('post.created', { id: pFresh, fieldId: F.gardening, format: 'text', tagId: 'help',
    title: 'Just-posted: is it too late to sow radishes?', nsfw: false, spoiler: false,
    bodyMd: 'Asking before the frost.' }, U.fern, minAgo(4));
  votes('post', pFresh, 1, 0);

  // ---------- the stress thread (~1,000 comments, depth up to 14) ----------
  const pStress = 'p_stress';
  ev('post.created', { id: pStress, fieldId: F.gardening, format: 'text', tagId: 'chat',
    title: 'Weekly free-for-all: ask anything, brag about anything', nsfw: false, spoiler: false,
    bodyMd: 'The megathread. Generated for collapse-performance testing.' }, U.sage, minAgo(60 * 8));
  votes('post', pStress, 210, 14);
  generateStressThread(ev, votes, pStress, now);

  return E;
}

// Seeded generator (spec §8). Fixed SEED_CONST → identical tree every replay.
function generateStressThread(ev, votes, postId, now) {
  const rnd = mulberry32(SEED_CONST);
  const authors = ['u_fern', 'u_aspen', 'u_briar', 'u_moss', 'u_sage'];
  const TARGET = 1000, MAX_DEPTH = 14;
  let count = 0, idx = 0;
  const queue = []; // {id, depth}

  const makeComment = (parentId, depth) => {
    const id = `cs_${idx++}`;
    const author = authors[Math.floor(rnd() * authors.length)];
    const ts = now - Math.floor(rnd() * 8 * 3600 * 1000); // within the last 8h
    ev('comment.created', { id, postId, parentId: parentId || undefined,
      bodyMd: snippet(rnd, depth), quiet: true }, author, ts);
    // power-law votes: most small, a few large
    const up = powInt(rnd, 0, 46, 2.6);
    const down = powInt(rnd, 0, 12, 3.0);
    if (up + down > 0) votes('comment', id, up, down, ts + 1);
    // one removed comment deep in the tree for stub coverage
    if (idx === 37) ev('mod.removed', { subjectType: 'comment', subjectId: id, reason: 'Off-topic' }, 'u_briar');
    count++;
    queue.push({ id, depth });
  };

  // seed top-level comments
  const roots = 14;
  for (let i = 0; i < roots && count < TARGET; i++) makeComment(null, 0);

  // breadth-first expansion with a decaying branch factor
  let qi = 0;
  while (count < TARGET && qi < queue.length) {
    const node = queue[qi++];
    if (node.depth >= MAX_DEPTH) continue;
    // branch factor higher near the top, thinning with depth
    const base = Math.max(0, 4 - node.depth * 0.28);
    const kids = Math.floor(rnd() * (base + 1));
    for (let k = 0; k < kids && count < TARGET; k++) makeComment(node.id, node.depth + 1);
  }
}

const FRAGS = [
  'Has anyone tried this in a colder zone?', 'Following — great thread.',
  'This matches my experience exactly.', 'Source? I have read the opposite.',
  'Underrated tip, thank you.', 'I disagree, but respectfully.',
  'Depth check: still readable down here?', 'The collapse gutter should handle this fine.',
  'Mulch, mulch, and more mulch.', 'My neighbor swears by the same method.',
  'Careful with nitrogen burn though.', 'Reporting back after a full season: worked.',
  'Counterpoint: microclimate matters more.', 'Saved for spring.',
];
function snippet(rnd, depth) {
  const a = FRAGS[Math.floor(rnd() * FRAGS.length)];
  const b = rnd() < 0.4 ? ' ' + FRAGS[Math.floor(rnd() * FRAGS.length)] : '';
  return a + b + (depth > 8 ? ` (depth ${depth})` : '');
}
