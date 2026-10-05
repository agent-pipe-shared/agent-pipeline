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

## Process observations

- Both Critics spent budget on guard refusals (Glob `GUARD-READ-TARGET`, `rg` spellings). Critic notes are not
  persistable for the Claude Critic agent in this lifecycle state — a durability gap against CR-06-D.
- Goldfish suite-run evidence is printed to the tool log and kept only under ignored `scratch/`, so a later Critic sees
  no artifact; future briefings name the capture path for the Critic.
