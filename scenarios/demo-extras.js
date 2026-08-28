// Scenario: the demo world — the classic `gardening` Feed with all eight
// persona seats in their documented states (README table): wren admin, sage
// owner, briar steward, fern member, moss probation-by-age, thorn banned,
// aspen high-rep AND at the post limit, dove pristine. Plus the stress
// thread. Generated, deterministic, no randomness. Replayed LAST by the
// seed so its registrations win for shared seats.

const DAY = 86400;

const events = [
  { t: -400 * DAY, actor: 'u_wren', type: 'account.registered', payload: { handle: 'admin.wren' } },
  { t: -360 * DAY, actor: 'u_sage', type: 'account.registered', payload: { handle: 'owner.sage' } },
  { t: -300 * DAY, actor: 'u_briar', type: 'account.registered', payload: { handle: 'steward.briar' } },
  { t: -280 * DAY, actor: 'u_aspen', type: 'account.registered', payload: { handle: 'heavy.aspen' } },
  { t: -210 * DAY, actor: 'u_fern', type: 'account.registered', payload: { handle: 'member.fern' } },
  { t: -150 * DAY, actor: 'u_thorn', type: 'account.registered', payload: { handle: 'banned.thorn' } },
  { t: -90 * DAY, actor: 'u_dove', type: 'account.registered', payload: { handle: 'pristine.dove' } },
  { t: -3 * DAY, actor: 'u_moss', type: 'account.registered', payload: { handle: 'newbie.moss' } }, // probation by age
  { t: -300 * DAY + 100, actor: 'u_sage', type: 'feed.created', payload: { id: 'f_gardening', slug: 'gardening', title: 'Gardening', description: 'Grow things. Argue gently.' } },
  { t: -299 * DAY, actor: 'u_sage', type: 'mod.stewardAdded', payload: { feedId: 'f_gardening', userId: 'u_briar' } },
  { t: -209 * DAY, actor: 'u_fern', type: 'feed.joined', payload: { feedId: 'f_gardening' } },
  { t: -140 * DAY, actor: 'u_thorn', type: 'feed.joined', payload: { feedId: 'f_gardening' } },
  { t: -100 * DAY, actor: 'u_aspen', type: 'feed.joined', payload: { feedId: 'f_gardening' } },
  { t: -2 * DAY, actor: 'u_moss', type: 'feed.joined', payload: { feedId: 'f_gardening' } },
  { t: -30 * DAY, actor: 'u_briar', type: 'mod.banned', payload: { feedId: 'f_gardening', userId: 'u_thorn', reason: 'repeated rule 1' } },
  // aspen: a well-boosted older post (reputation) + a fresh one (at the limit)
  { t: -20 * DAY, actor: 'u_aspen', type: 'post.created', payload: { id: 'p_asp_guide', feedId: 'f_gardening', format: 'text', title: 'The complete raised-bed guide' } },
  { t: -30, actor: 'u_aspen', type: 'post.created', payload: { id: 'p_asp_fresh', feedId: 'f_gardening', format: 'text', title: 'Quick frost warning tonight' } },
  // the stress thread: one post, forty quiet comments
  { t: -2 * DAY + 10, actor: 'u_fern', type: 'post.created', payload: { id: 'p_stress', feedId: 'f_gardening', format: 'text', title: 'What is everyone planting this week?' } },
];
for (let i = 0; i < 500; i++) {
  events.push({ t: -20 * DAY + 60 + i, actor: `sv_${i}`, type: 'vote.set', payload: { subjectType: 'post', subjectId: 'p_asp_guide', value: 1 } });
}
for (let i = 0; i < 40; i++) {
  events.push({ t: -2 * DAY + 100 + i * 30, actor: i % 2 ? 'u_sage' : 'u_briar', type: 'comment.created', payload: { id: `c_stress_${i}`, postId: 'p_stress', bodyMd: `Planting note #${i}`, quiet: true } });
}

export const demoExtras = {
  id: 'demo-extras',
  description: 'The gardening demo world: every persona seat in its documented state, plus the stress thread.',
  events,
  assertions: [
    { seat: 'u_wren', probe: 'perm', args: { feedId: 'f_gardening', key: 'canSuspendAccount' }, expect: true },
    { seat: 'u_sage', probe: 'perm', args: { feedId: 'f_gardening', key: 'canManageFeed' }, expect: true },
    { seat: 'u_briar', probe: 'perm', args: { feedId: 'f_gardening', key: 'canModerate' }, expect: true },
    { seat: 'u_moss', probe: 'perm', args: { feedId: 'f_gardening', key: 'probation' }, expect: true },
    { seat: 'u_thorn', probe: 'perm', args: { feedId: 'f_gardening', key: 'bannedHere' }, expect: true },
    { seat: 'u_aspen', probe: 'perm', args: { feedId: 'f_gardening', key: 'reportWeight' }, expect: 2 },
    { seat: 'u_aspen', probe: 'limitsInfo', args: { key: 'canPost' }, expect: false },  // 90s since post < 150s trusted cooldown
    { seat: 'u_aspen', probe: 'limitsInfo', args: { key: 'reason' }, expect: 'trusted' },
    { seat: 'u_dove', probe: 'unread', args: {}, expect: 0 },
    { seat: null, probe: 'feedInfo2', args: { slug: 'gardening', key: 'memberCount' }, expect: 5 }, // sage, fern, thorn, aspen, moss
    { seat: null, probe: 'threadInfo', args: { postId: 'p_stress', key: 'total' }, expect: 40 },
    { seat: null, probe: 'tally', args: { type: 'post', id: 'p_asp_guide' }, expect: { likes: 500 } },
  ],
};
