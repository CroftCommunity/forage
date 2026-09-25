# Device screencaps — view modes on the phones, 2026-09-25

**What these are:** `adb exec-out screencap` of Chrome on the two registered phones, driving
**forage.fyi as deployed** (main at `f45f6a0`, the view-modes landing; the service worker had
handed the Samsung the previous shell on the first load and installed `forage-v86` on the
second, as stale-while-revalidate does). They are NOT the repo script's captures
(`scripts/mock-snaps.mjs`, the frames the mock page shows): those are hermetic and named by
sha; these are the same build under a real network, a real account and a real thumb.

| file | phone | what |
|---|---|---|
| `samsung.clip1` … `clip2` | Samsung SM-S947U1 (test account) | Discover in Clip: the first frame playing muted on arrival; after one real swipe, the second frame active and playing, the first paused |
| `samsung.drawer2` | Samsung | the drawer: Your ring alone, no View section; the dropdown in the bar |
| `samsung.gram1` | Samsung | Discover in Gram |
| `samsung.fol-clip` | Samsung | Home at Follows in Clip: the people-scope reel, "10 clips from 4 people you follow" |
| `samsung.me-default` | Samsung | the account page: Default view and Play clips automatically |
| `samsung.320` | Samsung, **emulated** 320 CSS px (CDP device metrics; the phone is 384) | the bar one row, 61px, signed in |
| `samsung.fol-clip-chip` | Samsung (test account), **the clips-followups branch** served to the phone over `adb reverse` | Home at Follows in Clip after the fixes: the count line on its chip over the same bright screenshot-clip; the player looping (17.4 s clip, 16.3 s → 0.4 s measured through CDP) |
| `pixel.clip1` | Pixel 9 Pro (the owner's own session, read-only) | the owner's Home in Clip, bluesky-dark skin: 11 clips of 133; the first clip played to its end, muted |
| `pixel.drawer` · `pixel.gram` | Pixel | the drawer; Home in Gram, 40 picture posts of 127 |

Numbers measured through CDP alongside each frame are in the plan's Review Log
(`plans/2026-09-14-plan-clips.md`, 2026-09-25).
