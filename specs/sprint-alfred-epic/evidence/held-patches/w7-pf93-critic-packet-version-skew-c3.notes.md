# PF-93 c3: cases written, NOT green (CHECKPOINT)

Candidate 7641a25ab646d4a23ae471b4e4a6df9506e67708. Supersedes the c1 and c2 patches and notes for state (the c1 option (B), a release command for a claimed packet, stays a PO decision there).

## State
The patch (w7-pf93-critic-packet-version-skew-c3.patch, 4 files, +120/-6) is the c2 production draft plus five new cases appended to plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs (PF-93 (1), (2)+(7), (3), (4), (5)). Do NOT apply it as a finished fix: the new cases are RED both without and with the draft.

## Runs (all in the scratch clone, exit 1)
- RED (cases only, draft not applied): failing = line-231 pre-existing case + PF-93 (1)..(5). Log: scratch/agent-out/w7cd/red.session-critic-finalizer.test.mjs.log (untracked).
- With the draft applied: same six names fail. Cause printed in the final failure: the finalize call throws SCF-PRELAUNCH-ADMISSION with cause CPP-RECORD (the draft's cause passthrough works). CPP-RECORD comes from the test helper rewriteAsLegacyPacket: the rewritten packet.json/state/claim/admission files are not accepted by the packet reader (readJson). Writing canonicalJson instead of JSON.stringify did not change it (green2 log). The helper, not the draft, is the suspect: case (3) and (4) also fail only because the thrown code is CPP-RECORD instead of CPP-COORDINATOR-BINDING. So the RED here is NOT a valid proof of the legacy defect, and no GREEN exists.
- Not run: whole-file comparison versus clone2, the four-suite sweep, the apply check (driver check), cases (6) skip-coverage and a separate (7) (out of the briefed write scope; (7) is only covered through the generic-batch finalize in case (2)).

## Next step
Find what readJson in critic-packet-preflight.mjs requires of the stored files (record format, trailing newline, file mode, or a published-file sha), fix rewriteAsLegacyPacket accordingly, rerun: expect (1),(2),(5) RED on the unpatched tree and GREEN with the draft; (3),(4) green in both. Then whole-file runs in clone vs clone2, driver patch, driver check, driver cleanup (both clones still exist under scratch/agent-out/w7cd).

## Pre-existing failure
"private task snapshot binds uppercase delivered-v3 bytes without exporting record prose" (line ~216) fails in baseline and patched alike; untouched.

## Proposed commit message
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after GREEN)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. No file matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
