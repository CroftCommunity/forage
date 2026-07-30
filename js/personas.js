// Persona roster (spec §7). Eight seats + Logged out. Coverage-driven.
// `id` is the userId used across the event log; `null` = logged out.

export const PERSONAS = [
  { id: null,        handle: 'Logged out',   label: 'Logged out',     covers: 'Public reads, auth-gate prompts on every write' },
  { id: 'u_wren',    handle: 'admin.wren',   label: 'admin.wren',     covers: 'Site admin', admin: true },
  { id: 'u_sage',    handle: 'owner.sage',   label: 'owner.sage',     covers: 'Owner of gardening' },
  { id: 'u_briar',   handle: 'steward.briar',label: 'steward.briar',  covers: 'Steward of gardening (dual-hat)' },
  { id: 'u_fern',    handle: 'member.fern',  label: 'member.fern',    covers: 'Established member (default seat)' },
  { id: 'u_moss',    handle: 'newbie.moss',  label: 'newbie.moss',    covers: 'Probation, rate-limited', probation: true },
  { id: 'u_thorn',   handle: 'banned.thorn', label: 'banned.thorn',   covers: 'Banned from gardening' },
  { id: 'u_aspen',   handle: 'heavy.aspen',  label: 'heavy.aspen',    covers: 'High rep, at post limit, saved density' },
  { id: 'u_dove',    handle: 'pristine.dove',label: 'pristine.dove',  covers: 'Never seeded — empty states forever' },
];

export const DEFAULT_PERSONA_ID = null;       // dropdown default is Logged out
export const DEFAULT_LOGGED_IN = 'u_fern';    // seat 4, the default reader seat

export function personaById(id) {
  return PERSONAS.find((p) => p.id === id) || PERSONAS[0];
}
