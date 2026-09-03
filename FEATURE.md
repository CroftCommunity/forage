# self-thread — the hoist that ate a post

The 3i self-thread hoist treats ANY top-level reply by the OP as a continuation of
the post ("1/3, 2/3, 3/3"), hoists its words into the post body, and removes it from
the comment list. Owner hit all three consequences on 2026-09-03: the reply read as
post body, the head said "1 reply" beside a list saying "No replies", and the head's
Delete — the only control on that card — deleted the post.

The heuristic is RIGHT (it is the network's own: `app.bsky.unspecced.defs#threadItemPost`
`opThread`, shipped to every Bluesky user 2026-09-02). What is wrong is that a hoisted
part renders as ANONYMOUS BODY TEXT: no name, no time, no permalink, no controls.

This branch mocks two ways out (A: honest hoist; B: badge and pin, network-aligned)
per MOCKS.md P1 — both implemented in the engine and captured, not drawn.

Repos: forage. Coordination: claim `forage--self-thread.md`; rebase onto
`claude/ring-scope` when it lands.
