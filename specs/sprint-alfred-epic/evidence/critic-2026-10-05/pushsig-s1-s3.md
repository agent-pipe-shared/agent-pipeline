# Critic results — PUSHSIG slices S1–S3 (2026-10-05)

Coordinator record of two independent Critic dispatches (fresh context, read-only, route `claude-opus-5-5`, route
pre-check passed in both; assurance `functional-equivalent-read-only; OS isolation not asserted`). Spec:
[`../../design/feature-branch-push-signature-design.md`](../../design/feature-branch-push-signature-design.md).
Neither Critic could write its `critic-notes.md` (no Write tool; the Node write route is refused by `guard-devplan`
`opaque-interpreter-code` and, after the cap, by `DISPATCH-BUDGET-EXHAUSTED`), so the returned report is the only copy;
this file is its durable record.

## Review 1 — `2ecdfb5fe` (S3, generated pre-push hook + installer)

- **Verdict: PASS, no findings.** Scope matched spec rows 5–6; HK1–HK7 + HK3b present; fail-closed paths (import
  fault, waiver-read fault, unreadable state, empty remote) checked; no remote echo (SEC-01); no injection surface in
  the generated template.
- **Trajectory: not verifiable** — no machine-written artifact for the "44/44 green" claim and no dispatch record was
  supplied. Behavioural claims in the commit message matched the diff.
- Residuals named as out of scope: `git push --no-verify`; push-gate `off` early return; the protected lane's hook check
  still does not verify the signature (design Q2, PO-owned); `docs/push-release-flow.md` still describes the old
  checkpoint lane (slice S6).

## Review 2 — `f332d36aa` (S1 library) + `29629211c` (S2 guard-push)

- **Partial review; pass/fail withheld.** Budget (24) reached before the S1 test suite (`checkpoint-push-approval.test.mjs`),
  `guardrails/git.md`, `guardrails/security.md`, `CLAUDE.md` hard rules, `docs/push-release-flow.md` and ADR-0063
  placement of the `.patch` artifact were read.
- **F1 (minor, `29629211c`):** in a `git -C <source> push` checkpoint, the tolerated ` M <state>` entry is computed for
  the session project directory but applied to the source worktree's status, while the approval is read from the
  session project directory (`guard-push.mjs` ~1018, ~1931, ~2030–2054). A dirty state record in a different source
  worktree is tolerated although the verifier never reads it. No extra publication (the pushed commit is still
  signature-bound). Fix dispatched: PUSHSIG-F12.
- **F2 (minor, `29629211c`):** design §3.4's premise ("`approve-push` leaves exactly ` M project/pipeline-state.json`")
  is asserted only against the fixture's own write on the legacy `.claude/` path; the real writer and the neutral path
  are never exercised. Availability risk after install, fails closed. Fix dispatched: PUSHSIG-F12.
- Cleared: S1 mode/verifier/classifier fidelity, chat and waiver handling, fail-closed wrapping, tree source, root
  split, ordering, cross-lane behaviour, SEC-01, the TP-5 patch base, trailers.
- **Next Critic dispatch (scope only):** `f332d36aa` S1 test suite + the guardrail files above, plus the PUSHSIG-F12
  correction delta; base budget ≥ 32; supply suite-run artifact paths.

## Review 3 — `f332d36aa` (S1 test suite) + `016417c9a` (PUSHSIG-F12 correction)

- **Partial review; verdict withheld (inconclusive).** The budget hook enforces 24+1 working calls for the Critic
  agent; the dispatch stated 32 (dispatcher error: the Critic base cap is `min(24, maxTurns − 15)`).
- **Findings so far: none.** Cleared: S1 suite covers the §5 library list (CPM1-6, CPP1-12, CPA1-19 incl. SEC-01
  CPA18); F1 fix reachability (exemption only when `sameRealDirectory`; different directory, realpath fault or
  subdirectory `-C` stay strict); C14 premise against the real `approve-push` writer; tests additive only; C13a RED →
  GREEN in the logs; no secrets, no new dependencies, trailers clean.
- **Trajectory:** `016417c9a` consistent with `scratch/PUSHSIG-F12/{f1-red,green}.log` (41/2 → 43/0); `f332d36aa`
  not verifiable (no artifact for "41 checks red before, green after"; the count matches).
- **Open candidates, not reached:** whether C13c separates realpath from string equality (depends on
  `parsePushBinding` normalisation, `guard-push.mjs` ~381-556); whether C14's in-process `approve-push` is isolated from
  `CLAUDE_PROJECT_DIR` and the real home (`pipeline-state.mjs` `run()`).
- **Not reached:** `guardrails/git.md`, `guardrails/security.md`, `docs/push-release-flow.md`, `CLAUDE.md` hard rules,
  ADR-0063. Follow-up Critic dispatched with exactly that scope.

## Review 4 — `f332d36aa`, `29629211c`, `016417c9a` (guardrails, `parsePushBinding`, C13c, C14)

- **Partial review; verdict withheld** (hook cap at 20/24).
- **F1 (minor):** `29629211c` (S2) adds `specs/sprint-alfred-epic/design/pushsig-s5-guard-push-test.patch`, which the
  design assigns to slice S5 (§4, §8); row 9 (registration of the two new suites) is in none of the commits.
  Disposition: accepted as a documented slicing deviation (the patch is the reviewed S5 artifact for the signed
  package); row 9 joins `../../design/s2-package-1/test-registrations.patch` before the package is built.
- Cleared: S1/S2 spec fidelity incl. SEC-01; `parsePushBinding` admits only `git [-C <path>] push` and the F1 fix
  compares exactly the bound directory with `evidenceProjectDir` by native real path, fault → strict; C14 runs the real
  writer under `dir` (the only home-directory default, the external push ledger, is off without user config); C13c
  asserts what it names; GIT-01/02/03, SEC-01/04/10, QG-06, ADR-0011.
- Open hypothesis (not a finding): if Git already resolves the junction alias in `rev-parse`/`worktree list`, C13c would
  not catch a realpath → string-equality mutation.
- Trajectory: `016417c9a` consistent; S1/S2 claims not verifiable (no artifacts); the TP-5 guard-push regression with
  the staged patch has not run (it runs in the signed package ceremony).
- Not reached: ADR-0063 placement of the patch, `docs/push-release-flow.md` checkpoint section (slice S6, blocked by
  PO Q3), own read of `CLAUDE.md`, where `pushGate` is read from.

## Process observations

- Both Critics spent budget on guard refusals (Glob `GUARD-READ-TARGET`, `rg` spellings). Critic notes are not
  persistable for the Claude Critic agent in this lifecycle state — a durability gap against CR-06-D.
- Goldfish suite-run evidence is printed to the tool log and kept only under ignored `scratch/`, so a later Critic sees
  no artifact; future briefings name the capture path for the Critic.
