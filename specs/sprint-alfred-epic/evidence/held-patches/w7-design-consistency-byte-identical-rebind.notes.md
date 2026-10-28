# Held patch: design consistency accepts a byte-identical feature-directory rebind (Phoenix Wanted 4, slice 1)

Status: targeted delivery green; held patch, not applied. Candidate ab559b08b5160807f17353a0dd6719c3416fade8.
Patch: `w7-design-consistency-byte-identical-rebind.patch` (git diff --binary against the candidate; two files:
`plugins/pipeline-core/lib/design-consistency-check.mjs`, `plugins/pipeline-core/lib/design-consistency-check.test.mjs`).
Nothing under `plugins/` was edited in the repository; all edits were made in a real `git clone --shared` at the candidate.

## Cause
`analyzeReviewChain` compared `canonical(latest.sources)` with the current sources, and canonical includes the paths, so a
byte-identical folder move gave DCC-REVIEW-RECEIPT-BINDING. In `checkDesignConsistency` the report digest was read at the
receipt's old report path, which a moved folder does not observe (a pathStates hole is a DCC-INPUT caller error). The recon's
cited lines (342-348, 330-338, 296-303, 504-508) were re-read in the clone and matched.

## Invariant as implemented
New helper `sourceRebind(reviewed, current)` returns `{fromDir, toDir}` or null. It is an ADDITIONAL clause beside canonical
equality (`chainRebind` is null when canonical already equals, and the binding entry is emitted only when canonical differs AND no rebind):
- same roles: PRD, Spec and the same number of companions;
- every digest equal per role; companions paired in sorted order (identical relative suffixes keep the order identical);
- fromDir = directory of the old PRD path, toDir = directory of the current PRD path, they differ;
- every old path sits under fromDir and every current path under toDir with an identical relative suffix per role;
- every current path passes the existing `isSafePath`.
Also: `chainRebind` applies only when no receipt is a stub and the chain has at most MAX_REVIEW_ROUNDS receipts.
`unreviewedSourceDelta` keys by the path relative to the own directory when a rebind holds (so it is empty), otherwise path-keyed as before.
In `checkDesignConsistency` the reports of a rebound chain are observed at `toDir/<suffix>` (bound set, pathStates lookup, and the
entry path of a report digest mismatch). The early lenient source read keeps the order and messages of the DCC-INPUT errors.
Unchanged: every typed code and message, the DCC-INPUT hole behaviour, the delta chain path comparison between the two receipts, no new export.

## RED and GREEN (clone, test file plugins/pipeline-core/lib/design-consistency-check.test.mjs, ids U1-22 ascending)
- RED against the unchanged production code (log scratch/agent-out/w7rc/red.*.log): 5 red: (i), (iv), (v), (vi), (vii) moved-consistently.
  (iv) and (v) go red on their "control: the plain move is accepted" assertion. (ii), (iii) and (vii) one-moved are regression pins
  that are green before and after, because the old code already refuses on any path or hash difference.
- GREEN after the implementation: tests 60, pass 60, fail 0 (exit 0).
- Baseline clone2 (unchanged candidate): tests 52, pass 52, fail 0. Failing-name sets: baseline empty, patched empty. No pre-existing failure.
  New cases: 8 tests (60 - 52).

## What an attacker or mistake could exploit if the path comparison were dropped
A receipt for bytes X could attach to any file with the same bytes: a copy outside the feature directory, PRD and Spec swapped when two
files are byte-identical, a companion substituted by a same-bytes file, a mistaken rebind to a directory the registrar rejects, and the
delta-chain link by path would lose its meaning. The clause keeps them out by requiring identical relative layout per role, one shared
prefix per side, a differing directory pair, equal digests and safe paths.

## NOT done
- Slice 2: recording the rebind (`pathRebind`) in the signed approval binding; the PO signature must be re-requested after a rebind
  (binding digest changes). `design-approval-binding.mjs` is untouched.
- Slice 3: present-plan pin after a folder rebind.
- Whether receipt files move with the folder is undecided; the code accepts both (receipt path is observed where the caller says).
- A delta chain whose latest delta also has later drift after a move stays path-keyed (no rebind), as before.
- Full Verify, independent batch Critic (kernel path, signed-approval adjacent: T1), native run and PO acceptance stay parent-owned.

## Protected-path classification observed
Neither file matches TP-1..TP-13; both are plugin lib kernel sources, so a held patch applied by the operator.

## Proposed commit message
feat(design-consistency): accept a byte-identical feature-directory rebind in the review-chain comparison

## Operator flow
1. Apply the diff at the candidate (`git apply` of the patch; `git apply --check` passed in clone2 at the candidate, exit 0).
2. `git add -u -- plugins/pipeline-core/lib/design-consistency-check.mjs plugins/pipeline-core/lib/design-consistency-check.test.mjs`.
3. Commit with `--no-verify` (provenance trailers per the commit rules), then stamp and install.
