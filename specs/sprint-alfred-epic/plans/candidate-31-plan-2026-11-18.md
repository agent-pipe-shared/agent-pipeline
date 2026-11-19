# Candidate 31 plan (2026-11-18)

Sources: two consumer greenfield reports (run A: Claude runner, run B: Antigravity runner), both produced on the plugin stage of candidate 30h (manifest suffix `ce0f1d5`), i.e. BEFORE 30i, 30j and 30k. Every "open" call below was re-read in the current code unless marked "to recon". Consumer project names stay out of the repository (neutral labels run A / run B).

Acceptance of 31: a new greenfield run on the 30k stage (all runners) shows the lanes below working; its findings flow into 31 before the stamp. Full Verify and Critic stay as the PO orders them (suspended for candidates; Full Verify on the PO's word).

## PO decisions already taken (2026-11-18 tiles)

| Topic | Decision |
|---|---|
| Browser smoke | Stage 1 of the K24 options: reserved id `browser-smoke` in the existing `verifyImpact` declaration; absent means not applicable (never red); without a browser a red "browser check open" step with the install hint, never a fake pass; no new field, no new gate |
| Parallel slices | Attended probe first (Claude runner, `isolation: "worktree"`), built only after the PO reads the measurement. Run B shows the Antigravity branch worktree already runs two slices in parallel and integrates conflict-free, so only the Claude route is open |
| Test ownership | Derive: a test file of a module counts to that module (no unowned paths, no new exception). Extended by the baseline tile below |
| Risk trace | Stage 3, never blocking: each Spec risk row needs a test reference or an explicit residual statement, else it is listed as "without behaviour" in the close report and the Critic briefing as an inspection hint; no gate, no stored status |
| ADR | The pipeline produces an ADR draft per decision the design marks as expensive (existing `create-adr`), shown at close, no new signature |
| Scaffold | README and backlog file at onboarding, constraint (PO): they must never cause a write refusal, so they are admitted as pipeline-owned paths |
| Audit bundle | One piece, built as a wanted follow-up ADDENDUM to the closed bundle, not a second bundle version (PO question; see L6) |

## Lanes

Wave 1 (premise re-read in code, no open decision):

| Lane | Content | Evidence of the premise |
|---|---|---|
| L1 | Browser smoke stage 1 as decided | run A: overlay hides the PIN pad, progress ring stays 0 percent, found only by the Critic in round 3; run B: CSS specificity bug hid the `[hidden]` panel, found only by the Critic |
| L2 | Test ownership derivation in the boundary check | `architecture-boundary-check.mjs` rule `unowned-path` fires for every file in no module's `ownedPaths` |
| L3 | Spec risk trace stage 3 (K8 S3) | run A: accepted risk (deleted browser data) never became behaviour or a Critic question |
| L4 | ADR draft at design close | both runs: `docs/adr` empty or one hand-written file |
| L5 | README and backlog scaffold, write-admitted | run A and run B: PO had to ask how to start the app |
| L6 | Bundle addendum, built at close (see below) | run B closed local-only, so a push-triggered addition never fires there |
| L7 | Goldfish briefing for an Antigravity branch worktree: say that the child commits on its own branch | the generated text says "No git add, no git commit: the host commits" while `antigravity-native-dispatch.md` says the child commits (`AGYI-NO-COMMITS`, one wasted round trip) |
| L8 | Test-first RED evidence path inside the write scope | run A Goldfish: "no RED evidence file was written"; the briefing asks for it but does not admit its path |
| L9 | `finish-feature` rerun command through the shared human-command renderer | run A: backslash command mangled under `!`; the renderer exists but only `po-human-approval` and `push-prepare` use it |
| L10a | Critic delta preparation: evidence paths never enter `pathInvariantMap`; the inner refusal text of the preflight is passed through by the dispatch preparation | run B: six refusals before round 2 (`FPR-DELTA-MAP`, `CDP-ARGUMENT`, 4x `RE-DELTA-BINDINGS-INVALID`, `RDP-REQUIRED-PATH`); the map is still "exactly the changed paths" |
| L10b | Reference and example gaps (run B refusal table rows 1, 2, 4 to 7, 12): barrier-token notice after onboarding, no probing of absent plugin templates, `Model` in the native-dispatch example, finalize before receipt, package field names as a copy-paste template, verdict schema example with `severity` | each row names the missing sentence |

Wave 2 (needs a recon or a tile first):

| Lane | Content | Blocker |
|---|---|---|
| L11 | Baseline boundary policy: run B's 13 unowned paths were `public/*`, `docs/adr/*`, `docs/contracts/*`, `docs/state.md`, not tests; the fourth Critic round existed only because the policy file changed the tree | PO tile (baseline at `materialize-architecture` or default non-module path classes) |
| L12 | Delta bindings auto-derived from the diff (removes judgment fields) | PO tile |
| L13 | `DBG-GENERATED-DIGEST-MISMATCH` on Antigravity: the pointer is refused on purpose (`DBG-REF-CARRIER`, the worktree has no `scratch/`); a repair that names the first differing line instead of a bare mismatch | PO tile (cheap, guard code) |
| L14 | Two-step `commit-required` of the Critic preparation (4 of 4 rounds in run B) | recon: does 30h..30k already stage it |
| L15 | Antigravity child hook: `agy-native-child-model-mismatch` warning for `inherit`; `GUARD-PARSE-UNSUPPORTED` hint in the child's rules | recon |
| L16 | Hook `HGO-GIT` ETIMEDOUT under parallel load: bounded retry | recon |
| L17 | Cost summary for Antigravity (`usage-ledger` parses the transcripts, `cost-summary` writes no costs file) | recon |
| L18 | Main-context input share (64.5 percent of new input in run B came from large script JSON kept in context): measure which outputs dominate, then compact | measurement first |
| L19 | Parallel Claude worktree slices | attended probe (Claude Fam App session), then PO reads it |

Not built, with reason: OS isolation of the Critic and a real read sandbox (both reports classify them as contract, not technique; documentation states the limit honestly), signed product acceptance (chat attribution by design in signature mode), `WIN-AUTH-OPEN` in the Claude sandbox (host behaviour, decided by the next Windows run).

## L6: bundle addendum (answer to the PO question)

The closed bundle stays byte-identical. A follow-up addendum is appended next to it, binds the first bundle by its manifest digest and carries what only exists after the close: the security verdict (produced at close, so it goes in at close, never only at a push), the push signature and the final verify when a push happens, and the dispatch records of results the orchestrator landed. It is typed (`addendum`), verified together with the bundle and never blocks. Run B shows why push cannot be the only trigger: a local-only close never reaches it.

## Tiles answered later the same day (PO took the recommended option each time)

1. L11: `materialize-architecture` writes the baseline policy with the non-module classes (docs, public, manifests) before any Critic round, so the tree never changes shortly before the close.
2. L12: follow-up rounds derive path map and behaviour claims from `git diff <previous candidate>..HEAD` and the existing invariants (like `--auto-addenda`); the behaviour-claims judgment field goes away; the bindings file stays as an optional override.
3. L13: on a digest mismatch the guard names the first differing line and column and orders that exact line to be copied from the file; no pointer route, no loosening.

L11 to L13 move into wave 1 once their recon is written (they touch guard, hook and state sources: clone-slice route).

## L20: course continuity blocker of the Codex consumer (30k stage, PO 2026-11-18: solve sustainably in 31, with the follow-up steps)

Consumer B (Codex runner, installed 30k) is blocked at the close. Facts (read from its handover, neutral labels): feature P (a DISCARDED predecessor, its manifest and review unit preserved) and feature S (the active successor, manifest `supersedes: null`, first review base lies BEFORE the inherited implementation and before S's manifest). The review of S was admitted with `review.courseContext.successorOf: <P>` (the finalization request holds it) and consumed (allPacketsConsumed true, no open packets, courseHistoryRegistered false, registeredRounds 0). Then:

1. `register-feature-package.mjs --add-review-lineage --packet <id> --feature <S>` fails `FPR-LINEAGE-COMPILE` / `CCA-MANIFEST-READ`: `addCriticReviewLineage` (`lib/feature-package-registration.mjs`, about line 829) builds `identityInput` WITHOUT `successorOf` and calls `resolveRegisteredCriticCourseIdentity`; the resolver (`lib/critic-course-admission.mjs`, about lines 941 and 953 to 956) can rebuild the successor base only from a present predecessor or an already registered course binding. Before the first registered lineage neither exists, so it reads S's manifest at the historical review base and fails. Without the selector the outer result stays `FPR-LINEAGE-FEATURE-AMBIGUOUS` (two features hold a review unit). Confirmed here: `successorOf` does not occur in `lib/feature-package-registration.mjs` at all.
2. The delta path (about line 1006) has the same assumption (`features.length !== 1` gives `FPR-DELTA-FEATURE`).
3. Replaying the identical `finalize` after the consume is refused `SCF-PRELAUNCH-ADMISSION` (cause `CPP-GIT`), cause not diagnosed: needs an idempotent second readback for an already consumed successor review.
4. `scripts/dispatch-authorship-verify.mjs --range` takes its git cwd from the plugin install path (`REPO_ROOT`, about lines 136 and 971), not from the consumer project; it has no `--root`: it fails `fatal: not a git repository` from a consumer. The critic template asks for prose-free dispatch projections but the preflight offers no parameter for author evidence: provide or document the intended consumer route (never raw dispatch reports to the Critic).
Wanted: the sealed successor/course binding of the consumed packet is carried into the first lineage resolution and compilation and into the next delta round, with the selector kept; a test with a preserved discarded predecessor, an existing successor manifest with `supersedes: null`, a first review base before that manifest, admission through `--successor-of`, a consumed review, then only evidence and handover commits: the lineage registers and is repeatable without rewriting a manifest, restarting a review or changing the historical base. This lane has first priority of wave 1.

## Priority order (PO 2026-11-18: the two time levers are P1 and P2 of run B)

M1 L20 (unblocks consumer B), M2 L10a+L12 delta preparation (P1), M3 L2+L11 boundary baseline (P2), then L7+L8 briefing, L9 renderer, L10b references, then the remaining wave 1 and wave 2 lanes.

## Persisted rules

- The two free-text conditions of the PO (scaffold never blocked; bundle as an addendum) bind L5 and L6.
- No consumer names or machine paths in the repository.

## Status (2026-11-19)

- Built: lanes L1 to L18 plus B7 to B12 (follow-up commit by the close, timeline bytes per script and refusal code, origin/HEAD notice, labelled list-price estimates, readiness ADR question). Held chain `evidence/held-patches/c31-chain/` (37 patches plus `po-apply-0.7-candidate31.sh`, committed as `a7709d1fa`), rehearsed clean.
- Full Verify on the rehearsed final state: 1237 steps, 14 red; 7 red at base too, 7 load-flaky (green alone); no candidate regression left. Two real regressions of the first run are fixed in the chain.
- Not built: worktree write probe (classifier-denied in the Fam App session, measure in the greenfield), B4 short form (after the M0 measurement), README backfill (PO: none).
- Open: PO apply, stamp, install readback, then greenfield and Full Verify in parallel; Critic suspended and not run; PO acceptance open.
