# w268: the Critic subagent's stop issues the Source return record; a runner without one reaches the close through one PO acknowledgement (candidate 20, G20-39, AC-108)

Base: `f4e9c1d3d` (the candidate-20 build chain head). Built in the slice clone `scratch/agent-out/s-src` (clone commits 7113bec6e producer, 7ba085992 bridge gate, 6862ada86 signing route, walk, skill text). One held patch (it applies on top of the chain; `apply --check` in the real repository fails until the chain is applied in order).
Closest criterion: AC-108 (PRD and Spec unchanged). Antigravity gets NO producer in this slice (its subagent stop event is still being measured); it reaches the close through the acknowledgement.

STATUS: producer and bridge are both in the patch. Measured green: finalizer cases G20-39 (a)-(e) (RED 0/5 first, then 5/5), whole `session-critic-finalizer.test.mjs` 97/97, `close-coordinator-audit-lifecycle.test.mjs` 18/18 (includes the restated D2b refusal case and two new bridge cases), the walk with claude and codex issuing the record through the stop hook (green on the producer commit).
The walk `close-path-e2e.test.mjs` is GREEN on all three identities with the final code (tests 1, pass 1, fail 0; the first attempt failed VEP-DRIFT only because the clone was edited while it ran).
RED at hand-back: `lib/guard-maintenance-window-kernel-closure.test.mjs` GMWKC01 "NEVER_LIFTABLE_KERNEL_PATHS is not transitively closed (2 violation(s))" -- the new edges into `lib/critic-acknowledgement.mjs` (from `close-coordinator.mjs` / `pipeline-state.mjs`) and/or `lib/critic-source-return.mjs` (from the hook) reach a never-liftable kernel file. Not diagnosed further (budget). Repair per the briefing: extend NEVER_LIFTABLE_KERNEL_PATHS and `docs/guard-maintenance-window-threat-model.md` together (the doc is outside the patch's allowed paths), or avoid the edge.
NOT yet measured at hand-back: the `pipeline-state` and `po-human-approval` suites, the pins over `CRITICAL_ACTION_KINDS` / the human-terminal-actions catalog. No full Verify, no Critic review, no PO acceptance.

ELEPHANT COMPLETION (after the hand-back, clone commit `2892d9fff`, patch re-saved): GMWKC01 repaired by listing
`lib/critic-source-return.mjs` and `lib/critic-acknowledgement.mjs` in NEVER_LIFTABLE_KERNEL_PATHS and in the threat model
(their own imports were already listed) -> 1/1. The new kind and verb added to `docs/human-authorization-inventory.md` (row,
critical-action family list, legacy-renderer disposition) and to `templates/human-terminal-actions/catalog.json`; the catalog
count pin restated 21 -> 22 (QG-04 comment) -> auth-gate drift 35/35. `po-human-approval.test.mjs`: the new kind excluded from
the Usage loop with a positive assertion that prepare-critical composes it (212 tests, the one red fixed, rerun 6/6 of that
group). `critical-action-approval-request.test.mjs` kind list restated -> 1/1; `critical-action-authorization` 1/1;
`critical-human-proof-policy` 1/1. `three-runner-happy-path-with-two-po-approvals` pin: `approve-critic-acknowledgement`
classified off the happy path with an HONEST LIMIT comment (Antigravity has no producer yet, so there a rigor >= 1 close meets it
as a third per-feature PO interaction until a producer lands; on the PO list) -> 27 pass, 1 skipped. The check test now admits
exactly the two docs the pins demand. Still not run in the slice clone: the full `pipeline-state` suite and the native-goldfish-host
suites (run once on the integrated build clone w252).

## What the patch changes

1. PRODUCER. `lib/critic-source-return.mjs` (new): `issueCriticSourceReturn` writes `pipeline.session-critic-source-return.v1` to `<common-dir>/agent-pipeline/critic-packets/<packetId>/source-return.json` (mode 0600, exclusive, never overwritten); `readCriticSourceReturn` returns it as stored (null only on absence, so a wrong record reaches the finalizer's binding check). `hooks/native-goldfish-host.mjs` (already wired on `SubagentStop` for Claude and Codex; `hooks.json` / `codex-hooks.json` untouched) calls it first on every SubagentStop; a non-Critic stop is `not-applicable` and continues into the unchanged Goldfish route. One stderr line, empty stdout, exit 0.
2. FINALIZER. `originGate` reads the control area by default; `deps.readOriginalSourceReturnFn` stays as the test override. `SESSION_REVIEW_TTL_SECONDS` moved to `lib/critic-packet-preflight-read.mjs` (the script re-exports it); `readSubagentHandbackMessage` exported.
3. BRIDGE. Kind `acknowledge-caller-authored-critic` (`lib/critic-acknowledgement.mjs`, `CRITICAL_ACTION_KINDS`, private-store slot and `readPrivateApprovals` in `lib/critical-action-authorization.mjs`, `ALWAYS_REQUIRED_KINDS`, `po-human-approval.mjs` command-kind lists). `pipeline-state.mjs approve-critic-acknowledgement --by <name> --critic-packet <id>` is modelled on the reconcile record: chat or signature per `gates.human_approval`; chat is an attributed unattested record; in signature mode without proof flags it prints the signing command for exactly this subject (never runs it) and the follow-on command, and refuses. It refuses a packet whose receipt is not caller-authored, and records into the private approval store (a consumed proof is a replay). `close-coordinator.mjs assertCriticIndependenceForClose`: rigor 0 and low risk unchanged; otherwise an acknowledgement matching packetId, receipt digest, candidate commit and tree admits; else it refuses `CLOSE-CRITIC-CALLER-AUTHORED` naming `approve-critic-acknowledgement --by <name> --critic-packet <id>` (the old repair "finalize WITHOUT the fallback" was not runnable). The consumed receipt keeps the label `caller-authored-fallback`.
4. TEXT. `skills/critic-review/SKILL.md`: the Critic returns its verdict JSON as its whole final message or the LAST fenced json block; verbatim into `verdictPath`; what the fallback label means and the acknowledgement repair.
5. WALK. `close-path-e2e.test.mjs`: no in-process stand-in. Claude and codex: the stop hook runs as a child process with a fixture stop payload. Antigravity: the close refuses with the named command, an acknowledgement of a nonexistent packet is refused, then `approve-critic-acknowledgement` (chat, the fixture's mode) and the identical close.
6. TESTS restated in place (QG-04): the D2b refusal regex in `close-coordinator-audit-lifecycle.test.mjs` now expects the acknowledgement command instead of "without the fallback" (comment names why).

## How the stop is correlated to the claim (no value of the calling agent is trusted)

Measured Claude SubagentStop fields: `session_id`, `transcript_path`, `agent_id`, `agent_type`, `last_assistant_message` (absent when the child ended with SubagentHandback; then the PF-61 reader of the child's last handback is used), `cwd`, `stop_hook_active`. Codex: `agent_type`, `last_assistant_message`, `session_id`. The Critic is recognised by the runner-reported `agent_type` (`critic`, `pipeline-core:` stripped). The packet is the ONE packet of the stop's runner that is claimed, admitted, inside the review window and unresulted; zero or several issue nothing (stderr explains). The record binds `packetId`, `packetDigest`, `claimant`, `sessionId` from the private packet/admission and `verdictSha256 = sha256(canonicalJson(verdict))` of the schema-shaped verdict in the Critic's message. The Critic cannot write the verdict file itself (its only writable file is `critic-notes.md`); the coordinator copies the returned JSON, and any change (even key order) refuses `SCF-ORIGINAL-SOURCE-BINDING`.

## Not changed

`hooks/hooks.json`, `hooks/codex-hooks.json`, `lib/path-spelling.mjs` and the separator-sweep sites, `templates/prompts/critic-review.md` (outside the patch's allowed paths; the skill text carries the return format), `docs/human-authorization-inventory.md` and `templates/human-terminal-actions/catalog.json` (no entry for the new command was added; whether a pin demands one is unmeasured), the closed `featureCloseAudit` record shape.

## Open

- The acknowledgement reference is NOT carried into the close record: `featureCloseAudit` is a closed shape (`publication-close-journal.mjs`, `onboarding-continuity.mjs`) and `inputDigest` is recomputed at apply in `preparedAuditReadback`, so a new field needs both sides. The label stays on the consumed and exported receipt, and the acknowledgement lives in the private approval store; the close output does not show it.
- Signature mode is rendered, not walked end to end (no test signs and consumes an acknowledgement proof).
- Registration: no new hook script, no new test file (verify-suites.json untouched); new lib files `critic-source-return.mjs` and `critic-acknowledgement.mjs` may need the derived inventory refreshed (not run).
- Not proven: a real runner stop payload (fixtures shaped from the measured fields), the Antigravity runner, parallel Critic rounds of one runner (issue nothing, by design).
