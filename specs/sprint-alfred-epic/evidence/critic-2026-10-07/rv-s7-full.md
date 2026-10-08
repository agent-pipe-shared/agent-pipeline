# Critic — RV-S7 full review (e15aa1797, cfe695a5d)

Route claude-opus-5-5 (effort not observed), functional-equivalent-read-only. PARTIAL (checkpoint at call 16; pass/fail
withheld). Not reached: `guardrails/security.md`, the calibration file. Notes not persisted (guard refused `node -e`).
Trajectory not verifiable (evidence bound to `189e6a33e`, dirty, not to `cfe695a5d`; no RED artifact for RV-S7-T).

## Findings

- RV7-D1 (major): the forgery-stopping checks have no test — `intent.kind` (`harness/scripts/attended-recovery.mjs:200`),
  `decision` (`:201`), `sha256(canonical(intent)) === proof.intentSha256` (`:202`), `intent.subjectSha256` (`:204`). Deleting
  `:202` or `:204` leaves all nine tests green. Ruling 41a, QG-11, RV-8.
- RV7-D2 (major, not reproduced): `execFileSync("git", …, { cwd: repo })` (`:107-108`) — on Windows the bare name is
  searched in the child's working directory first, so a `git.exe` planted at the root of the repository under repair
  would run in the attended session. Spec 1107-1113, ruling 41a.
- RV7-D3 (major, evidence): `evidence/rv-s7-f2.txt` records head `189e6a33e`, dirty — not candidate-bound. Spec
  1194-1195, QG-02/QG-03.
- RV7-D4 (minor): the anchor path is not checked against `--repo` (`:161`, `:178`); an in-repo anchor file is accepted
  when the operator passes it. A7 (ruling 41).
- RV7-D5 (minor): no byte-equality pin of the inlined recipe; the header (`:16-17`) claims coverage the suite does not
  have (hand comparison: currently faithful). Design note Q1 [D].
- RV7-D6 (minor, not reproduced): the CLI entry guard (`:238`) compares `import.meta.url` with an unresolved `argv[1]`;
  through a symlink/junction `main()` never runs and the exit status is 0. Ruling 41a.

## Dispatcher disposition (2026-10-08)

Ruling 49: (a) RV7-D1, D4, D5, D6 get pins (RV-S7-T2: one case per forgery check; an anchor path inside `--repo` is
refused `ATR-ANCHOR-MISMATCH`; a byte-equality test of `canonical` and the verify recipe against
`plugins/pipeline-core/lib/po-approval-proof.mjs`; the entry guard compares realpaths). (b) RV7-D2: the git call resolves
the executable from `PATH` explicitly (never from the repository directory) and refuses `ATR-INPUT-INVALID` when the
resolved executable lies inside `--repo`; pinned with a stub `git` in a fixture root. (c) RV7-D3: evidence for the fix is
captured on a clean tree at the fix commit (EVID-F now records head/tree/dirty). One fix slice (RV-S7-F3), then
self-verify. RV-8 stays "implementation in progress" until then.
