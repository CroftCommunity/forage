// W10 — do the registered hosts still exist, still speak OAuth, and still have
// the signup posture we claim? (Phase B, LIVE=1 only)
//
// The registry is hardcoded on purpose: the sheet paints synchronously, and
// probing four third-party servers on the front door to avoid drift would be a
// bad trade. The drift lives here instead — second use of the pattern
// curated-names-live.workflow.mjs established, for the same reason. Hardcoded
// facts about someone else's service rot silently.
//
// live = true, so this NEVER runs in push CI and the runner SKIP-reports it
// loudly rather than leaving it silently absent.
import assert from 'node:assert/strict';
import { HOSTS, SIGNUP } from '../js/auth/hosts.js';

export const live = true;

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  return { ok: res.ok, status: res.status, json: res.ok ? await res.json().catch(() => null) : null };
};

export async function run() {
  const drift = [];
  const unreachable = [];

  for (const h of HOSTS) {
    // A host that is DOWN and a host that CHANGED are different findings and
    // must not be reported as the same one: the first is not our regression.
    const desc = await get(`${h.entryway}/xrpc/com.atproto.server.describeServer`);
    if (!desc.ok || !desc.json) { unreachable.push(`${h.id} (${h.entryway}): describeServer ${desc.status}`); continue; }
    const oauth = await get(`${h.entryway}/.well-known/oauth-authorization-server`);
    if (!oauth.ok || !oauth.json) { unreachable.push(`${h.id}: no oauth-authorization-server (${oauth.status})`); continue; }

    const posture = desc.json.inviteCodeRequired ? SIGNUP.INVITE : SIGNUP.OPEN;
    const prompts = oauth.json.prompt_values_supported || [];
    console.log(`  ${h.id.padEnd(9)} posture=${posture.padEnd(6)} ours=${h.signups.padEnd(6)} create=${prompts.includes('create')}`);

    if (posture !== h.signups) {
      drift.push(`${h.id}: we say '${h.signups}', ${h.entryway} says '${posture}' — update js/auth/hosts.js`);
    }
    if (!prompts.includes('create')) {
      drift.push(`${h.id}: no longer advertises prompt=create (${prompts.join(',') || 'none'}) — the Create/Sign-in split is a lie for this host`);
    }
    if (!(oauth.json.scopes_supported || []).includes('transition:generic')) {
      drift.push(`${h.id}: dropped the transition:generic scope we request`);
    }
  }

  // Reported, never thrown away — but a dark third-party host is not a reason
  // to fail the suite the way OUR claim being wrong is.
  if (unreachable.length) console.log(`\n  UNREACHABLE (not our regression, but worth knowing):\n    ${unreachable.join('\n    ')}`);

  assert.deepEqual(drift, [],
    `the host registry no longer matches the network:\n  ${drift.join('\n  ')}`);
}
