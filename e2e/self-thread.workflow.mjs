// W-self — the self-thread mock's claims (plans/mocks/self-thread.html;
// CroftC MOCKS.md P5: what a Proposed frame promises, a check holds, so
// approving the frame approves what the gate runs).
//
// Owner, 2026-09-03, four screenshots and a message: a reply to their own post
// rendered as the post's BODY, the head said "1 reply" over a list saying "No
// replies", and "deleting that 'comment' did in fact delete the post".
//
// The population is e2e/harness/mock-selfthread.mjs, the same tree the frames
// were captured from. Every claim below is one a frame makes.
import assert from 'node:assert/strict';
import { scenario } from './harness/scenario.mjs';
import { RESPONSES, ALONE, FAKE_SIGNED_IN, THREAD_PATH, ALONE_PATH,
  PART_URIS, DECOY_URI, OP_REPLY_URI, REROOTED_URI } from './harness/mock-selfthread.mjs';

const open = async ({ responses = RESPONSES, path = THREAD_PATH, mode = null, width = 1280 } = {}) => {
  const seed = mode ? [`try{localStorage.setItem('forage.selfthread','${mode}');}catch{}`] : [];
  const s = await scenario('first-visit', { mode: 'bluesky', initScripts: [FAKE_SIGNED_IN, ...seed], responses });
  await s.page.setViewportSize({ width, height: 900 });
  await s.page.goto(`${s.origin}${path}`);
  await s.page.waitForSelector('.head-actions');
  return s;
};

export async function run() {
  // ---- the head, with the chain hoisted (the shipped placement) ---------------
  {
    const s = await open();
    try {
      const head = await s.page.evaluate(() => {
        const card = document.querySelector('.card');
        return {
          count: card.querySelector('.postmeta')?.textContent.trim(),
          badges: [...card.querySelectorAll('.part-meta .part-badge')].map((b) => b.textContent.trim()),
          partDeletes: card.querySelectorAll('.part-meta [data-delete-post]').length,
          headDelete: [...card.querySelectorAll('[data-delete-post]')]
            .filter((b) => !b.closest('.part-meta')).map((b) => b.textContent.trim()),
          words: card.textContent,
          empty: !!document.querySelector('.empty'),
        };
      });

      // The badge the network renders, on our own arithmetic: the root is 1/3.
      assert.deepEqual(head.badges, ['2/3', '3/3'], 'each part says which part it is');

      // The count is the LIST. It was the appview's replyCount (13 here), which
      // counts a hoisted part and cannot count a re-rooted one.
      assert.equal(head.count, '3 parts · 11 replies',
        'the head names the parts and counts only what the list shows');
      assert.ok(!head.count.includes('13'), 'never the appview\'s raw replyCount again');

      // The delete hazard, both halves: a part can delete itself, and the button
      // that deletes the POST says so.
      assert.equal(head.partDeletes, 2, 'every part carries its own Delete');
      assert.deepEqual(head.headDelete, ['Delete post'],
        'and the one that deletes the post is the only one that says post');

      // Oldest-first: the decoy is NEWER than part two and the appview returned
      // it FIRST. It is a comment, not the post's second paragraph.
      assert.ok(head.words.includes('The whole jig took an afternoon'), 'part two is in the head');
      assert.ok(!head.words.includes('they are called Fastenal'),
        'the ranked-first, later self-reply is NOT hoisted');
      assert.ok(!head.empty, 'a thread with eleven replies is not empty');
    } finally { s.errors(); s.consoleErrors(); await s.close(); }
  }

  // ---- what stayed a comment --------------------------------------------------
  {
    const s = await open();
    try {
      const ids = await s.page.evaluate(() => [...document.querySelectorAll('.comment')].map((c) => c.dataset.nodeId));
      assert.ok(ids.includes(DECOY_URI), 'the decoy self-reply is listed, not swallowed');
      assert.ok(ids.includes(OP_REPLY_URI), 'the OP answering someone ELSE is a comment');
      assert.ok(ids.includes(REROOTED_URI), 'a reply under a part re-roots into the list');
      for (const uri of PART_URIS) assert.ok(!ids.includes(uri), 'a hoisted part is not also a comment');
    } finally { s.errors(); s.consoleErrors(); await s.close(); }
  }

  // ---- the pinned placement ---------------------------------------------------
  {
    const s = await open({ mode: 'pin' });
    try {
      const out = await s.page.evaluate(() => {
        const card = document.querySelectorAll('.card')[1] || document.querySelector('.card');
        const kids = [...card.children];
        const parts = [...document.querySelectorAll('.comment[data-kind="part"]')];
        return {
          parts: parts.map((c) => c.dataset.nodeId),
          badges: parts.map((c) => c.querySelector('.part-badge')?.textContent.trim()),
          partDeletes: parts.map((c) => c.querySelectorAll('[data-delete-post]').length),
          // pinned parts stand ABOVE the sort bar: they are not competing for a
          // position, they are the post continuing itself
          firstSort: kids.findIndex((k) => k.querySelector?.('.pillsel') || k.classList.contains('sortbar')),
          headWords: document.querySelector('.card').textContent,
        };
      });
      assert.deepEqual(out.parts, PART_URIS, 'the parts are nodes in the list, in chain order');
      assert.deepEqual(out.badges, ['2/3', '3/3'], 'each carrying its number');
      assert.deepEqual(out.partDeletes, [1, 1], 'and its own Delete, because it never stopped being a post');
      assert.equal(out.firstSort, 2, 'both parts precede the sort bar');
      assert.ok(!out.headWords.includes('The whole jig took an afternoon'),
        'and none of them is drawn inside the post');
    } finally { s.errors(); s.consoleErrors(); await s.close(); }
  }

  // ---- the reported tree: one self-reply, nothing else ------------------------
  // The contradiction verbatim. main prints "1 reply" above "No replies"; the
  // two numbers came from different places and one of them was not the list.
  {
    const s = await open({ responses: ALONE, path: ALONE_PATH, width: 390 });
    try {
      const out = await s.page.evaluate(() => ({
        count: document.querySelector('.postmeta')?.textContent.trim(),
        empty: document.querySelector('.empty')?.textContent || '',
        badges: [...document.querySelectorAll('.part-badge')].map((b) => b.textContent.trim()),
        deletes: [...document.querySelectorAll('[data-delete-post]')].map((b) => b.textContent.trim()),
      }));
      assert.equal(out.count, '2 parts · 0 replies', 'the head counts what is there');
      assert.ok(!out.count.includes('1 reply'), 'the sentence the owner read is gone');
      assert.ok(out.empty.includes('No replies'), 'and the empty state still says so honestly');
      assert.deepEqual(out.badges, ['2/2'], 'the reply is named as the post\'s second part');
      assert.deepEqual(out.deletes, ['Delete', 'Delete post'],
        'two buttons, and only one of them takes the post');
    } finally { s.errors(); s.consoleErrors(); await s.close(); }
  }
}
