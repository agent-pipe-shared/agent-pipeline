# Critic delta re-review 1: PHX-2 rework (base `ad49c48`, head `8a54751`)

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max.
**Reviewed object:** delta `ad49c48..8a54751` on `specs/sprint-phoenix-epic/design/phx-2-additive-ledger-authority.md`, prior finding IDs F1-F5.
**Verdict: FAIL — one new MAJOR defect introduced by the F1 fix; 3 MINOR.**

## Findings

1. **MAJOR (F-A)** — the F1 fix inserts `discoverRepository(projectDir)`/`discoverRepository(dir)`
   into both integration points with no error handling and no failure-mode entry.
   `discoverRepository` throws on ≥7 paths (missing/symlinked start path, git spawn
   failure/non-zero exit, submodule/`--separate-git-dir` common-dir shape,
   missing primary root) — `worktree-lifecycle.mjs:163-169,231-249`.
   `guard-push.mjs` has no try/catch around the integration point (`:1646,1696`);
   per `hooks.json`'s own exit-semantics comment (0 allow / 2 block / 1 allow+warn),
   an uncaught throw exits 1 — which **allows the push** and silently discards
   every other already-accumulated push-gate failure. Direct contradiction of
   §4's own "the gate must fail closed once enabled." Reachable per this repo's
   own documented conditions (`CLAUDE.md` Environment note: `git` can be
   unexpectedly absent from PATH → `WT-GIT-SPAWN`). The one existing call site
   that uses this same derivation pattern (`po-gate-authority.mjs:483-487`)
   wraps it in try/catch; the design's fix does not copy that pattern.
   Secondary: no `timeout` passed to the two new git subprocesses, unlike the
   file's two existing spawns (`guard-push.mjs:750-753,427-430`, both `5000`).

2. **MINOR (F-B)** — the new §4 write-side recovery path (option (a): "an
   operator manually removing the just-added `criticalProofConsumption` entry")
   prescribes a hand-edit ADR-0029 forbids outright ("written EXCLUSIVELY
   through the CLI ... never hand-edited", `docs/adr/0029-file-handoffs-status.md:7,11`).
   No CLI subcommand proposed, no ADR amendment flagged.

3. **MINOR (F-C)** — the new §4 write-side taxonomy omits `EEXIST` — the one
   write-side outcome the single-use mechanism exists to produce, and the
   exact signal for the Git-level-replay scenario §1 point 1 defends against.
   No distinct disposition/code for it.

4. **MINOR (F-D)** — the F1 justification's "every real call site" claim (7
   named sites) doesn't fully hold: `po-gate-profile-publisher.mjs:197-200`
   and `po-gate-authority.mjs:484` derive via `resolvePoGateRepositoryTopology`,
   not `discoverRepository` (that file doesn't import it at all — contradicting
   §3's own added claim that `pipeline-state.mjs` already imports
   `discoverRepository` "for `inspectSessionClosure`"; it doesn't,
   `pipeline-state.mjs:321`). Two more real call sites omitted
   (`setup.mjs:1238-1241`, `codex-advisory-bootstrap.mjs:94`). Conclusion
   direction is still correct (both primitives are worktree-invariant) — only
   the "one universal primitive" framing overclaims; two exist.

## Deliberately not flagged (genuinely resolved)

F1 (core fix, worktree-invariance) — resolved, only its justification overclaims (F-D).
F2 (ENOENT) — resolved cleanly, `mkdirSync` idempotent, 0o700 survives typical umasks.
F3 (chat-mode scope) — resolved thoroughly, all 20 `chat` occurrences checked, no
residual coverage claim anywhere in the document.
F4, F5 — resolved as specified.
Scope (doc-only, 1 file) — verified clean. Authorship trailer — verified clean.

## Trajectory check

Inconsistent — high citation precision overall (12+ spot-checks all exact), but
2 delta-added claims (F-D) don't hold, and the delta's central mechanism change
(F-A) was made without checking the callee's error contract.

## Disposition

Remedy is narrow, does not touch the approach: wrap the derivation at both call
sites, add a fail-closed `PUSH-EXTERNAL-LEDGER-TOPOLOGY-*` disposition to §4
(refuses the push, never a silent bypass), plus the 3 minor corrections. Next:
a second, narrowly-scoped rework (F-A/F-B/F-C/F-D only — F1/F2/F3/F4/F5 stay as
landed), then a second bounded delta Critic re-review before implementation.
This is Critic round 3 of the package (initial + delta 1 + delta 2), within
the 4-round cap.
