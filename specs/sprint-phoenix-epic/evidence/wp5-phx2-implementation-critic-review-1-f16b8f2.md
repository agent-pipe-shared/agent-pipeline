# Critic review 1 (implementation): PHX-2 external push-ledger implementation

**Reviewer:** pipeline-core:critic, functional-equivalent-read-only lane, requested route claude-opus-5 at max. Effective model identity: unknown (no direct same-dispatch route evidence observed).
**Reviewed object:** commits `8b34e1f`, `6bdaeb0`, `f16b8f2` (enumerated, confirmed via `git rev-list 8b34e1f^..f16b8f2` — exactly these three, no extras), base `7e8983f`.
**Verdict: FAIL** — F1 blocker, F2/F3/F4 major, F5 minor.

## Findings

### F1 — blocker: the opt-in gate key cannot be adopted; the live V3 validator rejects `gates.push_external_ledger`

The design's entire rollout mechanism is one new opt-in key in `pipeline.user.yaml` (§5). Commit `f16b8f2` registered it in `plugins/pipeline-core/scripts/pipeline-user-v3.schema.json`, but that JSON file is never used for validation — it is loaded into `USER_SCHEMA` and only re-exported for a test. The validator that actually validates the live `pipeline.user.yaml` is the hand-written `validatePipelineUserV3` in `runner-profiles-v3.mjs`, whose closed-`gates` check still lists `push_approval` as the only optional key. Setting the new key therefore makes the file invalid, breaking `check-routing-projections.mjs`'s `routing-projection-check` step of `verify.mjs` (QG-02: the one verify gate) for any project that actually follows §5's rollout instructions. Reproduced in memory: `validatePipelineUserV3({gates:{...,push_external_ledger:'required'}})` → `additional_property` at `$.gates.push_external_ledger`.

Evidence: `plugins/pipeline-core/lib/runner-profiles-v3.mjs:237` (optional list unchanged), `:142-145` (additional_property rule); `plugins/pipeline-core/scripts/check-routing-projections.mjs:98-102,143`; `harness/scripts/verify.mjs:167`. Commit `f16b8f2`'s own message asserts the opposite mechanism, which is false.

### F2 — major: the candidate's own verify gate is red; no verify.mjs run in the submitted evidence

The repo's calibration names exactly one gate command (`project/pipeline.json:4`). The machine-written verify evidence for the exact candidate (`evidence/verify-latest.json`, commit `f16b8f239a62f6a48d048d4b720bc1c8237ddfb2`, tree `61816c4e...`, `"candidate":{"binding":"exact"}`) records `exitCode: 1`, `verifyRun: null`. The evidence artifact this dispatch submitted (`specs/sprint-phoenix-epic/evidence/wp5-phx2-implementation-verify-f16b8f2.json`) contains no `node harness/scripts/verify.mjs` run at all — only 4 targeted test files + doc-contracts + observation-governance + security-scan.

### F3 — major: the submitted evidence artifact is model-authored prose, not a script-written record

Custom schema `pipeline.wp5-implementation-evidence.v1`, hand-written narrative `resultSummary` fields (including a re-run rationale and self-declared verdict for the security scan, and a literal `<worktree>` placeholder left in a recorded "command" string), not the script-written `pipeline.verify-evidence.v0` form QG-03 requires.

### F4 — major: `externalPushLedgerGate` fails closed for projects that never opted in, contradicting the design's day-one safety guarantee

The design fixes absent/no-opinion as `"off"`. The implementation adds a state the design does not have: whenever the working-tree `pipeline.user.yaml` has no HEAD blob (untracked) or diverges from HEAD by one byte, the gate resolves to `"required"` without ever parsing the key. A project mid-V3-migration with an untracked/locally-modified `pipeline.user.yaml` gets every `signature`-mode push refused with `PUSH-EXTERNAL-LEDGER-MISSING`, with no operator action having enabled the gate, and recovery is not a simple retry (a fresh Ed25519 signing ceremony is needed, since the local proof is already consumed).

Evidence: `plugins/pipeline-core/lib/external-push-ledger.mjs:206-210,214-218` (reached before `resolveGateValue(...)` at `:220`), consumed unconditionally at `guard-push.mjs:1687` and `pipeline-state.mjs:5224`.

### F5 — minor: the read side sources the new gate's configuration from the pushed repository, not the governed session root

One line above the new block, the ADR-0056 waiver is deliberately read from `fallbackProjectDir()` (governed session root, not the pushed target) with an in-file comment explaining exactly why ("would let the target stand its own gate down"). The new call passes `projectDir` (the pushed repository) instead, so a target repository's own committed `gates.push_external_ledger: "off"` can disable this specific gate for a session whose root has it required. Contained (base ADR-0056 attestation still applies), so this weakens defense-in-depth, not the base gate.

Evidence: `guard-push.mjs:1643-1648` vs `:1687,1699`.

## Deliberately not flagged

Spec fidelity (read-side placement, write-side placement, module semantics: wx-exclusive write, EEXIST→ALREADY-CONSUMED, MISSING/MISMATCH read disposition), the `manifestOrDir`/`projectDir` deviation from the design's literal snippet (checked correct — `manifest` in `guard-push.mjs` is a different, nested-shape file), scope (every touched file enumerated or a disclosed necessary consequence), authorship (all 3 commits carry the `Dispatch: WP5-phx2-implementation (goldfish)` trailer, no orchestrator-authored diff, no private correlation metadata), test integrity (no suite weakened; sibling-file precedent for TP-protected suites verified real), edge cases/failure paths (fingerprint/proofSha256 assertion paths cannot realistically throw given upstream guarantees; timeout-forwarding is inert for existing callers), guardrails (no secrets, no machine-specific paths, Conventional Commits), security surface (0o600/0o700 modes, no injection surface, no operand interpolation in failure messages), documented-instead-of-fixed (no undated TODO), dependency reality check (no new external dependency; every import resolves to an existing exported symbol at the cited path), language assignment (all new artifacts correctly English).

## Trajectory check

**Verdict: inconsistent.** The submitted evidence reports 7 green checks for candidate `f16b8f2`, but the repo's own script-written gate record for that exact commit/tree is red (`evidence/verify-latest.json`, `exitCode: 1`, finished 2 minutes after the candidate commit). The calibrated verify command appears nowhere in the submitted artifact, which is itself not script-written (custom schema, narrative fields, a `<worktree>` placeholder). One claim in commit `f16b8f2`'s own message (that `check-routing-projections.mjs` schema-validates against the JSON file) is contradicted by the code it cites (F1). What is consistent: the three enumerated SHAs, their `Dispatch:` trailers, the file list, and the code-level claims in the module's own header comments.

## Briefing violations

None. All required references resolved; no chat/handover/state/narrative/prior-verdict content was present in the dispatch.
