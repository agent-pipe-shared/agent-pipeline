# K112-CALIBRATION-S4-FOLLOWS-R1 notes (Goldfish, clone k112, BASE main fa2ee78b6; ruleset 0.7.0+claude.20261022204428.79cda46)

## What R1 requires (specs/sprint-alfred-epic/plans/acceptance-reconstruction/R1.md, AC-232, RELEASED 2026-10-16)
"If the identity is missing, aliased or taken from a substituted root, then the system shall refuse to treat the calibration as bound
to the project and shall report why." R1 names NO code. Chosen: new code `PCI-ALIAS-REFUSED` in the existing PCI-* family. R6/R5 not needed.

## Change
- lib/project-calibration-identity.mjs (KERNEL, protected): `aliasRefused()` result = `unavailable` + `code PCI-ALIAS-REFUSED` + additive `message`
  naming the stored name, the root-derived name and the repair ("regenerate the project identity or set "project" to the root name"). Applied to
  (a) no metadata and name != root name (non-placeholder), (b) metadata kind configured-alias with name != root name. S2 root-derived
  mismatch keeps PCI-NAME-MISMATCH. A no-metadata name EQUAL to the root name now resolves kind `root-derived` (was configured-alias; it is no alias).
  Metadata alias with name == root keeps its declared kind. S1/S3/S5/S6/S7 untouched.
- lib/consumer-verify.mjs + scripts/consumer-verify-check.mjs (KERNEL, protected): the thrown message appends ` - <message>` only when the identity
  carries one. All pre-existing refusals stay byte-identical (S8 equality assertions unchanged).
- Pin (unprotected): S4 restated under QG-04 (bounded justification above the hunk, cites PO decision 2026-10-23 + R1); header reads S1-S8 released,
  S4 follows R1; +3 new cases (name == root resolves both ways, consumer fail-closed with repair text). One S6 FIXTURE restated (byte-equal tiers
  case used alias "alpha" under another root; fixture root now named `alpha`; assertion unchanged).
- DISCOVERED CONSEQUENCE (decision taken, flag for Critic/PO): `verify-evidence-producer.mjs` `--commit` verified an earlier commit inside a temp
  worktree always named `checkout`; with alias refusal that refused every project whose root is not named `checkout` (3 existing tests red).
  Smallest fix: the temp worktree directory is now named like the checkout root (`commitWorktreePath()`), unprotected file. Alternative not taken:
  a root-name override parameter on the identity reader (larger, touches the kernel API).
- Fixture restatements (no assertion changed): verify-evidence-producer.test.mjs (2 calibrations: project -> basename(root)),
  parallel-work-in-one-checkout-is-unsafe.test.mjs (2: "parwork-m4"->"m4-root", "parwork-m5"->"m5-root"). Justification: PO decision 2026-10-23, R1.

## Counts (each alone, TMPDIR private via scratch/K112-CALIBRATION-S4-FOLLOWS-R1-run.mjs; pin run directly: node --test <pin>)
- RED (new S4 expectations, unchanged product): pin 31 tests, 27 pass / 4 fail (the 4 new/restated S4 cases; reason: 'resolved' vs 'unavailable', kind, no throw).
- Pin before: 28/28 (per briefing, not re-measured). After: 31/31 (exit 0).
- verify-evidence-producer.test.mjs: first after-change run 39 tests 7 pass / 32 fail (fixture alias); after fixture fix 36/3 (the --commit worktree name);
  after commitWorktreePath 39/39. Pre-change baseline not re-measured (no stash allowed); the failures were all PCI-ALIAS-REFUSED.
- parallel-work-in-one-checkout-is-unsafe.test.mjs: 17/19 (2 alias fixtures) -> 19/19 after fixture restatement.
- push-prepare.test 73/73; verify-journal.test 95/95; calibration-verify-commit-transition.test 4/4; cli-help.test 8/8;
  harness/scripts/check-consumer-safe-paths.test.mjs 9/9 (before and after producer change). All GREEN, exit 0.
- NOT run: project-onboarding-v3.test.mjs (onboarding output untouched; it never calls the reader), consumer-verify.test (none exists; no
  project-calibration-identity.test exists), pipeline-state*.test, security-scan*.test, dispatch-briefing.test, agy-* pins, kernel-closure tests
  (their calibration fixtures were not traced; they may carry alias fixtures reaching consumer verify -> Critic/Elephant should run the full matrix).

## Risks / open
- The repo's own project/pipeline.json stores project "agent-pipeline" with no projectIdentity; on any checkout whose directory is not named
  `agent-pipeline` the consumer verify now fails closed with PCI-ALIAS-REFUSED (repair: add projectIdentity / rename project). PO decision follows R1.
- Onboarded projects with root-derived metadata inside a `--commit` worktree still depend on repositoryPathIdentity (rootSha256), unchanged.
- ratchet line effect against architecture/boundary-policy.json: not measured (no boundary check run); +~12 lines in a kernel module.

## Deliverables
- scratch/agent-out/K112-CALIBRATION-S4-FOLLOWS-R1-k112-protected.diff (3 kernel files; `git apply --check` vs main: OK; stacking on the C15-C28 bundle not checked)
- scratch/agent-out/K112-CALIBRATION-S4-FOLLOWS-R1-k112-unprotected.diff (pin, parallel-work pin, verify-evidence-producer.mjs + test; apply --check OK).
  Not committed: the pin is green only with the protected diff applied, so per the briefing it is a diff, not a commit. The clone still carries all edits.

## Proposed commit messages (trailers: AI-Assisted: true / Dispatch: K112-CALIBRATION-S4-FOLLOWS-R1 (goldfish))
1. protected: fix(calibration): refuse an aliased project identity with PCI-ALIAS-REFUSED (AC-232, R1)
2. unprotected: test(calibration): restate S4 to follow R1 and name the --commit worktree after the root (QG-04, PO decision 2026-10-23)
