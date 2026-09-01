// W-fence — the harness fences the NETWORK, not just window.fetch.
//
// Found 2026-09-01 while gating the post-text branch: mock-board.workflow.mjs
// failed roughly one run in five with
//
//   scenario closed with 1 collected error(s):
//   Failed to load resource: net::ERR_NAME_NOT_RESOLVED
//
// at https://video.cdn.test/clip/playlist.m3u8 — the fixture's own video, which
// the workflow presses Play on deliberately (mock-board decision I: a native
// video plays in place). The host is RFC 2606 reserved and never resolves, and
// that was the intent: "nothing plays here". But a <video> element's own load
// does not go through window.fetch, and e2e/harness/shim.mjs fences nothing
// else — so the browser really did a DNS lookup on every run, and whether its
// failure arrived as a console error before the scenario closed was a race
// against the machine's resolver. Measured pre-existing: five corpus runs on
// origin/main failed it twice, five on the branch failed it twice.
//
// The flake was the visible half. The invisible half is worse: a fixture that
// reaches the real network is not hermetic, whatever its green says, and every
// <img>, <video>, <iframe> and stylesheet in every workflow was unfenced.
// A resolver that answered — a captive portal, a wildcard DNS provider, an ISP
// hijack (this laptop's OpenDNS does exactly that for unknown names) — would
// have served real bytes into a "hermetic" test.
//
// So the fence moves down a layer: scenario() routes every request the page
// makes, and anything that is not the harness's own origin is refused locally
// and RECORDED. Nothing leaves the machine, deterministically.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, BOARD_PATH } from './harness/mock-board.mjs';

export async function run() {
  // ---- claim 1: an external resource load never reaches the network --------
  const s = await scenario('first-visit', { mode: 'bluesky', responses: RESPONSES });
  try {
    const { page } = s;
    const escaped = [];
    page.on('requestfailed', (r) => escaped.push(`${r.failure()?.errorText} ${r.url()}`));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${s.origin}${BOARD_PATH}`);
    await page.waitForSelector('.postrow');
    // the same press the board workflow makes: a native video mounts with a
    // playlist on a host that does not exist
    const clip = page.locator('.postrow').filter({ hasText: "That's my job" }).first();
    await clip.locator('button[data-play]').click();
    await page.waitForSelector('.postrow video', { timeout: 5000 });
    await page.waitForTimeout(1500); // long enough for a real DNS lookup to fail

    assert.deepEqual(escaped, [], `a request left the machine — the harness is not hermetic:\n  ${escaped.join('\n  ')}`);

    // ---- claim 2: and it was recorded, not silently swallowed --------------
    const blocked = await s.blockedExternals();
    assert.ok(blocked.some((u) => u.includes('video.cdn.test')),
      `the playlist load was not recorded as a blocked external (got ${blocked.length}: ${blocked.slice(0, 3).join(', ')})`);

    // ---- claim 3: the page's own assets are NOT fenced ---------------------
    // The fence must catch the network and nothing else — a harness that blocked
    // its own origin would break every workflow while looking strict.
    assert.ok(blocked.every((u) => !u.startsWith(s.origin)), 'the harness blocked its own origin');
    assert.ok(await page.locator('.postrow').count() > 0, 'the app still loaded and rendered');

    // ---- claim 4: no console error survives ---------------------------------
    // This is the flake itself, stated as a claim: with nothing attempted, there
    // is no failure to report, so there is nothing to race the close.
    assert.deepEqual(s.consoleErrors(), [], 'a console error was collected');
    assert.deepEqual(s.errors(), []);
    return { ok: true, claims: 4, blocked: blocked.length };
  } finally { await s.close(); }
}
