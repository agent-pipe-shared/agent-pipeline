# w7-brownfield-pin-header-n2 (held patch notes)

Slice W7-BROWNFIELD-PIN-HEADER-N2-C1-20261027. Base: candidate a1c2682466643bdc58ad9665c824c3a83f02533a. Comment-only.

## Cause
The header of `plugins/pipeline-core/lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs` (lines 5 to 8) said the net-new ratchet under a deferred adoption IS covered by section (c) with two states (existing path ready/report-only, net-new path full fitness check). The case bodies (lines 73-75, 201-203, 220-234) assert since D162 that both states get ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED.

## Changed lines
Only comment lines 3 to 11 of the pin file (7 insertions, 7 deletions in the diff; 9 header lines rewritten, 2 lines identical). SPDX line and line 2 kept. No code line, assertion or case name changed. The header now states: the draft-time applicability predicate and the entry-readiness fall-through to the adoption disposition; every path under a deferred adoption, net-new or existing, gets ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED since D162 (net-new ratchet retired); the explicit established-with-ratchet state is follow-up work after 0.7.0 (D142) and NOT covered.

## RED / GREEN
The slice is comment-only, so no case was added to the registered test file. The criterion check is a driver header check (`driver.mjs redcheck`) of the header text: RED on the unchanged clone (`staleClaimPresent=true freshClaimsPresent=false => RED`), GREEN after the edit (`staleClaimPresent=false freshClaimsPresent=true => GREEN`).

## Counts
Command: `node --test <pin file>` in each clone.
- clone (patched): tests 16, pass 16, fail 0, exit 0.
- clone2 (baseline at candidate): tests 16, pass 16, fail 0, exit 0.
- Failing-name sets: both empty, identical.
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## Not done
No Full Verify, no independent Critic review (parent-owned batch gate), no PO acceptance. No commit made (native host-commit).

## Proposed commit message
test(architecture): state in the brownfield pin header what the cases pin since D162

## Operator flow
1. Apply the diff: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-brownfield-pin-header-n2.patch`.
2. `git add -u -- plugins/pipeline-core/lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs`.
3. Commit with `--no-verify` (held-patch bundle flow).
4. Stamp, then install.

## Protected-path classification observed
The pin file matches none of TP-1 to TP-13 in `templates/prompts/agent-obligations.md` section 2; it was edited only in the scratch clone, never in the repository.
