# Neutral findings registry — 70287f72 / d40906df (transport fix, closing round)

Source: T1 Critic fix-verification round (opus, max;
functional-equivalent-read-only) of commits `70287f72` and `d40906df`, the
second and closing round for the selected-Codex-Critic transport package
under the two-round cap. Verdict: **FAIL**, resting on F-A alone.

- **F-A** (major): the commit adds a comment characterising the
  completed-but-invalid child branch as a "conservative unclear case" when
  the bridge it routes to writes four definite terminal values —
  `childStarted: true, exitCode: null, stdioStatus: "lost", cleanupStatus:
  "pending"` — against an observed `exitCode: 0, stdioStatus: "complete"`.
  No owner, no expiry.
- **F-B** (minor): the two tests that close round-1's F2 (cases 108, 109)
  were never observed red; only case 107 was.
- **F-C** (minor): the diff was reviewed against a red gate.

## Disposition

**F-A is the dispatcher's, and the correction is self-verified — the cap is
spent.** The briefing for this package said, in field 4: *"Do not carry the
exit code/signal through on the completed-but-invalid path in this package.
Report on it only."* The dispatch obeyed, reported (its opinion: schema
accepts any safe integer for `exitCode`, the binding gate checks
`dutyReceipt.status` independently, `stdioStatus: "complete"` plus
`dutyReceipt.status: "error"` is the separation the schema intends), and
wrote a comment. The comment overstated the branch as conservative. The
Critic put it exactly: the finding lands against the briefing's scoping. It
does. The next dispatch carries the observed terminal through on that
branch and corrects the comment; the Elephant verifies it directly, no third
round.

**F-B rides with it.** The fix dispatch captures cases 108 and 109 red
against the pre-fix source, or states why one of them cannot be.

**F-C cleared** minutes after the review returned: the TP-3 registration
landed under PO signature (`eecb4273`) and both registration checkers are
green.

## Two dispatcher errors the Critic recorded, both mine

1. **The round-1 registry was not neutral.** It carried a verdict line, a
   dispatcher-error narrative, a sizing expectation ("the fix is one line")
   and dispositions. The template admits a findings registry as *finding IDs
   only*. The Critic did not use the excess; the excess was still there.
2. **"F3 — filed, not fixed here" was false.** No item existed. The closing
   round tested the claim and found nothing. That is the third absence-or-
   presence claim of the day made without the search behind it, and this one
   was a claim of presence. Filed now, late, with a `due` date:
   `2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds.md`.

Also on record: `d40906df` — the dispatch-record correction — is
completion-report prose inside the review object, an inadmissible category
the Critic could not avoid reading because the dispatcher enumerated it.
Tracked at `2026-09-04-a-dispatch-record-carries-implementor-prose-into-a-critic-that-must-not-read-it.md`;
the lesson for the dispatcher is not to put a record-correction commit into a
Critic's enumerated range.
