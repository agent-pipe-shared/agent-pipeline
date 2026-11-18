---
name: critic-review
description: "Independent, diff-scoped Critic review of one finished piece of work. Started without a Spec path and a fixed diff range it refuses at once, before any bootstrap or git command, and names scripts/critic-dispatch-preflight.mjs as the command to run first. Pass PATHS/REFS ONLY - the Critic constructs its own input (git diff, spec, guardrails, evidence) and never accepts prose context. Runs by default as a fresh-context read-only session subagent; two-phase protocol - adversarial hunt, then evidence-gated honest report. Runner-native isolation is an optional explicit escalation."
disable-model-invocation: false
argument-hint: "<spec-path> <fixed-candidate-diff-range> [guardrail-path ...] [evidence:<path> ...] [sha:<ruleset-sha>] [project:<name>] [verdict:yes|no] [assurance:runner-native:<evidence>|functional-equivalent-read-only]"
context: fork
agent: critic
---

# critic-review — independent review run (standard stage)

**Arguments gate (first step, before the bootstrap line, any State read or any git command):** the arguments received are `$ARGUMENTS`. If they hold fewer than two whitespace-delimited tokens — no Spec path, or no fixed diff range — print exactly one line, `dispatch defect: missing {{FIELD}}; run scripts/critic-dispatch-preflight.mjs first, its packet-ready result carries the Spec path and the fixed range`, naming each absent field (`{{SPEC_PATH}}`, `{{DIFF_RANGE}}`) in place of `{{FIELD}}`, and STOP. That line replaces the §2 bootstrap confirmation: print nothing else, read no file, run no command, start no dispatch. The caller runs `scripts/critic-dispatch-preflight.mjs` against the fixed base and candidate before this skill; this gate only catches a start without its arguments.

**Reference:** MANDATORY for the dispatched Critic: before any review step read `references/critic-protocol.md` in full. It carries the Critic protocol (0. Parse the dispatch with the Review-scope rule, 2. Bootstrap confirmation, 3. Construct your own input, 4. Phase A, 5. Phase B, 6. Report format); `## 1. Stage gate` stays in this file, below. The dispatched Critic needs no other reference file.
**Reference:** The Coordinator (the Elephant that dispatches the review) loads `references/coordinator-course.md` at its stated conditions: before the first dispatch (batch course, call site, briefing hand-over, request-file shape, export, named-requirement admission, evidence shape, diagnostic route), to choose the record that admits the first review (PF-70), for real commits after a consumed PASS (D199) and for the generic exact-range batch registration. A dispatched Critic never needs it.

**Reference:** the prospective batch course and the normal call site moved to `references/coordinator-course.md` section A; Coordinator, load it before the first dispatch.

You are the **Critic** of the Agent-Pipeline (agent `critic`: fresh context, read-only). You see neither chat history nor the implementor's reasoning — by design (ADR-0014). This skill body plus the path arguments below are your ENTIRE dispatch. Canon pointers (agent-pipeline repo, not runtime reads — repo-root paths shown; `roles/critic.md` and `templates/prompts/critic-review.md` also have a plugin-root vendored copy per `pipeline-start` SKILL.md's canon-reference rule, for a hosted project that does read them): `docs/operating-model.md` (*Roles and boundaries* — Critic row; *Evidence, review and recovery*), `harness/review-protocol.md` §2.1 (*Trigger decision table*), `roles/critic.md`, `templates/prompts/critic-review.md`.

`disable-model-invocation: false` permits the Elephant to dispatch this standard review gate autonomously after the applicable plan gate and the Critic-boundary evidence/preflight requirements are met; it does not require a prior full release Verify. A Critic still does not replace a PO decision, final acceptance, or an explicitly configured gate. `context: fork` + `agent: critic` is deliberate: no conversation history can leak in. Fallback if fork dispatch is unavailable: the Elephant dispatches the `critic` agent directly with the path-only briefing template (`templates/prompts/critic-review.md`, agent-pipeline repo — plugin-root fallback per `pipeline-start` SKILL.md's canon-reference rule for a hosted project).

**Dispatch admission (Elephant, mandatory):** immediately before every Critic
spawn, run `scripts/critic-dispatch-preflight.mjs` against the fixed base and
candidate. Pass the candidate Spec, every declared guardrail, each fresh
candidate-evidence path and, for a re-review, the separate prior-Critic path
to the preflight only. Call shape: `node scripts/critic-dispatch-preflight.mjs --root . --base <commit> --candidate <commit> --spec <path>` (flags, no `--range`); the skill's own `$ARGUMENTS` are positional (`<spec-path> <range>`, see Grammar below), and a `key=value` form is accepted by neither.
Dispatch only when its `pipeline.critic-dispatch-preflight.v1` result is
`packet-ready`. `packet-ready` has `spawnAuthorized: false` and names
`session-critic-dispatch` as its required next gate: the session orchestrator's
ordinary fresh-agent dispatch remains the execution authority. Its
returned `dispatch.reviewerInput` carries the frozen refs, ruleset SHA,
resolved governance directories, candidate-file guardrails and evidence paths
passed to this skill. The caller adds only its route metadata (`project:`,
`verdict:` and `assurance:`); it must not reconstruct or omit any preflight
field. The `coordinatorOnly.priorCriticEvidence` binding is retained for range
and lineage checks and must never be copied into the reviewer input. This
preflight is read-only. Before the fresh Critic starts, the coordinator calls
`session-critic-finalizer.mjs admit` with the exact closed request below. This
rechecks preflight and the retained feature-package course, then creates and
claims one private candidate packet and publishes a digest-bound prelaunch
admission. An `admitted` result does not itself launch a model or replace the
ordinary session orchestrator's fresh read-only dispatch. After the session
returns a schema-shaped verdict, `finalize` consumes that *same* preclaimed
packet; it never creates a replacement after return. The receipt is accepted
only after an identical second consume readback. A caller must not invent
Git blob references for ignored local evidence: the complete preflight digest
binds that evidence to the session packet instead.

**Reference:** the briefing hand-over (`prepare-dispatch.mjs critic`, `critic-fill`) moved to `references/coordinator-course.md` section B; Coordinator, load it when handing the briefing over.

The canonical before/after commands are:

```bash
node "${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs" admit --root "$PWD" --request scratch/session-critic-finalization-request.json
# Dispatch one fresh, independent, read-only Critic only after `admitted` readback.
node "${PIPELINE_PLUGIN_ROOT}/scripts/session-critic-finalizer.mjs" finalize --root "$PWD" --request scratch/session-critic-finalization-request.json
```

**Reference:** the closed request-file shape of `admit`/`finalize` moved to `references/coordinator-course.md` section C; Coordinator, load it before writing the request.

The Critic returns its verdict JSON as its whole final message or as the LAST fenced `json` block of it; the Critic's stop hook (Claude, Codex) reads it there and issues the Source return record for the one open admitted packet, so `finalize` labels the verdict `source-issued-origin`. On Antigravity the Critic child ends by calling `send_message` to its parent conversation with that JSON as the `Message`; the PreToolUse hook issues the same record from it (the child is recognised from the host's own subagent descriptor, never from the message), so the acknowledgement below is not the normal route there either. Write that JSON verbatim (same key order) to `verdictPath`. Without a record (a stop or message that issued none, no schema-shaped verdict in it, or several open packets) `finalize` labels it `caller-authored-fallback`, which the feature close refuses at rigor >= 1 or high risk; the repair it names is `pipeline-state.mjs approve-critic-acknowledgement --by <name> --critic-packet <packetId>` (the PO's acknowledgement of exactly that packet and candidate; in signature mode the command prints the signing step), then the identical close command.
A rejected prelaunch admission is a coordinator defect, not Critic work: do
not spawn a child or substitute prose/evidence. A returned verdict without
the exact prelaunch admission cannot mint a passing receipt.

**Reference:** the export of a consumed review, the opt-in named-requirement admission, the evidence artifact shape and the diagnostic evidence route moved to `references/coordinator-course.md` section D; Coordinator, load it before preflight and after `finalize`.

**Closed bootstrap role:** this skill is itself an authoritative Critic role
carrier. If a SessionStart reminder requires `pipeline-core:pipeline-start`,
invoke its compact `critic` role; an omitted adapter argument must not select
the Elephant default. Validate the preflight identity but never execute its
onboarding `nextAction`, inspect State/handover/history, or perform an Elephant
bootstrap. `CRITIC-BOOTSTRAP-ROLE-CLOSED`.

**Reference:** `## Which record admits the first review (PF-70)` and `## Real commits after a consumed PASS (D199)` moved to `references/coordinator-course.md` section E; Coordinator, load it when a review is refused for want of a dispatch record or when real commits follow a passed round.

## Continuing a Critic course after the first round (PF-94)

Script paths resolve under the plugin root the bootstrap prints. **Every later round carries the `taskId`
of the first delivery** (the Goldfish dispatch record the first review was admitted on), never a new one:
`session-critic-finalizer.mjs admit` accepts a review candidate that descends from that delivered record,
whoever wrote the commits in between, and a new `taskId` has no record, so it is refused
(`CPP-REVIEW-ADMISSION`). Pass the same `--task-id` to `critic-dispatch-preflight.mjs` to see the
refusal before a packet is reserved. Order:

1. `session-critic-finalizer.mjs inspect-course-takeover --root <root> --request <scratch request.json>`,
   then `supersede-course-takeover` with the printed digest and a reason. Only when the old batch
   belongs to an earlier course key or to no course; never for the same course key.
2. Rerun round 1 on the course path.
3. `register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>` BEFORE
   the next correction commit; commit the manifest and the lineage file it names.
4. Make the correction commit.
5. Produce the diagnostic (`critic-diagnostic-evidence.mjs`), register it with
   `--add-diagnostic-evidence <path>`, commit artifact, log and manifest in one evidence-only commit.
6. Write the input JSON and run `register-feature-package.mjs --root <root> --add-delta-request <input.json>`
   (keys: `changedBehaviorClaims`, `pathInvariantMap` with exactly the changed paths,
   `coordinatorImpactConfirmed`, `impactAmbiguous`).
7. Commit the manifest and the request file the verb names.
8. Rerun `critic-dispatch-preflight.mjs` for round 2 with the arguments the verb prints.

Request files for the takeover verbs are regular `.json` files in the repository scratch:
inspect `{"schema":"pipeline.session-critic-course-takeover-inspect-request.v1","featureId":"<feature>"}`;
supersede adds `"digestSha256"` and `"reason"` and uses the `...-supersede-request.v1` schema.

| Code | Meaning and what to do |
|---|---|
| `CGB-CONFLICT` | An earlier batch owns the work ids; it may belong to an earlier course key: use the takeover verbs. |
| `CGB-TAKEOVER-COURSE` | The owner is the SAME course key: do not take over; register its lineage with `--add-review-lineage`, or continue in delta mode. |
| `CGB-TAKEOVER-HISTORY` | The feature already has registered history: continue in delta mode. |
| `CGB-TAKEOVER-OPEN` | The old batch holds an unconsumed packet: finish it, or release it and inspect again (a batch of an earlier course whose packets were all released can be retired). |
| `FPR-LINEAGE-TRANSPORT` | The lineage does not resolve; with `CCA-TRANSPORT-SOURCE-DRIFT` (a non-evidence-only commit follows the round) it can no longer be registered: use the takeover verbs, rerun round 1. |
| `CCA-DELTA-REQUIRED` | A retained review exists: register a delta request, rerun preflight with its path. |
| `CCA-REQUESTED-MODE` | First review is full, every later one delta: rerun preflight with the required mode. |

## 0 and 2 to 6. The Critic protocol (MANDATORY for the dispatched Critic)

**Reference:** Sections `0. Parse the dispatch` (with the `Review-scope rule (hard)`), `2. Bootstrap confirmation`, `3. Construct your own input`, `4. Phase A`, `5. Phase B` and `6. Report format` moved to `references/critic-protocol.md`; the dispatched Critic reads it in full, with `## 1. Stage gate` below, before any review step. The Operator note of section 2 stays in this file, after the Stage gate.

## 1. Stage gate (self-enforcing, before any review work)

Construct the touched-file list yourself: `git diff --name-only {{DIFF_RANGE}}`. If it touches **architecture/guardrail/security surfaces** — `hooks/`, `agents/`, `.claude/settings*`, permission/guard config, `guardrails/`, `policies/`, secrets/auth/credentials, or A/G/S-marked `riskZones` from the calibration — it is T1. Dispatch the default fresh functional-equivalent session Critic on its own review-tier route (the higher-capability tier only for the one batched Critic over genuinely critical architecture or security changes, MP-07). Runner-native isolation is optional only when explicitly configured or requested.

For T1, first require `verdict:yes` and one `assurance:` argument. Missing,
contradictory, or unrecognized assurance → report `dispatch defect: T1 requires
runner-native isolation or the standing functional-equivalent assurance` and
STOP (no partial review). `assurance:runner-native:*` must run through the
selected runner's native lane rather than this generic standard-stage skill.
`assurance:functional-equivalent-read-only` proceeds here when this is
ONE fresh independently briefed Critic with no chat/history or implementer
reasoning, refs-only bounded input, strict read-only/no-write/no-subdelegation,
fixed candidate commit/diff, and the route MP-07 selects; otherwise report a
typed runtime failure and STOP. Its report MUST carry the literal assurance above and never
claim OS isolation or effective model identity.

> "Every architecture/guardrail/security diff gets the Critic in ONE fresh independently briefed, contractually read-only session subagent with a JSON-schema-shaped verdict and the literal assurance `functional-equivalent-read-only; OS isolation not asserted`, on the review-tier model (the Critic agent's own Sonnet route). The batch rule binds EVERY Critic, on whichever tier: ONE overall Critic per batch of slices (never one per slice or per diff), and every follow-up Critic of that batch is a re-critic restricted to the delta diff since the reviewed candidate. The higher-capability tier is used additionally only for a genuinely critical architecture or security change, as that one batched Critic. This session lane is the autonomous default. Selected-runner native isolation is an optional explicitly configured or requested escalation, not a prerequisite for the ordinary Critic and not a Pipeline PO gate. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher-capability tier applies there only for a genuinely critical architecture or security change, reviewed once per batch."

(Canonical English wording, authoritative — word-identical in `harness/review-protocol.md` §2.1, *Trigger decision table*, `roles/critic.md` and ADR-0003/ADR-0014; `docs/operating-model.md` does not carry this wording.)

**Reference:** `## 2. Bootstrap confirmation` moved to `references/critic-protocol.md` (the dispatched Critic reads it there); its Operator note stays here:

**Operator note (ranges with state or retained results):** for any range that contains the calibration handover file, a handover file of the same naming, or a retained Critic result, first derive the bindings with `plugins/pipeline-core/scripts/critic-correction-input-bindings.mjs derive --root --base --head --out` (a project-state record, finding-disposition record or retained prior result exclusion, never readable; a finding-disposition record is only a file the project calibration lists in `criticFindingRecordPaths`, so a project whose backlog or feedback files quote earlier Critic findings lists them there and commits the calibration before the range is derived) and pass the file as the Correction input bindings field; never invent a role. The exact names: preflight takes the flag `--correction-input-bindings <file>`; admit and finalize take the request key `review.correctionInputBindings` with the same value in both (omit the key when the range has no such paths, never null). The bindings file must still exist at finalize: if it was swept, derive again for the same range (derive is deterministic). For an effective FULL round (a delta request that is impact-ambiguous, RE-DELTA-FALLBACK-FULL) the range is the course genesis base to the candidate, not the correction range: derive with `--base <genesis base>`; the preflight refusal names that base. Passing the file is optional: when the flag is omitted the preflight derives the same bindings in memory and echoes them as `derived: true` (admit and finalize then bind that echo), and `--registration-commit` may be omitted too when exactly one commit after the candidate qualifies (several refuse, never the latest). The built-in project-state convention covers `docs/HISTORY.md` and everything under `docs/state-archive/`; any other history-named markdown or text file in the range is refused before a packet is reserved with `CDP-HISTORY-IN-RANGE` (list it in `criticFindingRecordPaths` in BOTH calibration mirrors, or leave it out of the range). A missing delta input file is written as a path skeleton by `--add-delta-request` (the judgment fields stay for the Coordinator: `changedBehaviorClaims`, `pathInvariantMap`, `coordinatorImpactConfirmed` and `impactAmbiguous`). Mind the cost of `impactAmbiguous`: set to true it makes the next round an effective full round over the whole feature range, several times the files and reviewers of a diff round, and a registered value cannot be taken back; the verb therefore refuses a true value (FPR-DELTA-FULL-ROUND-UNCONFIRMED, nothing written) until it is rerun with `--confirm-full-round`. The Coordinator no longer supplies `trustBoundaryChanged` (PO decision 2026-11-17): a diff round never becomes a full round on it, and an old request that carries the key is still accepted and the value is ignored; the first full round of a course reviews the whole trust boundary.

**Reference:** `## Generic exact-range batch registration (Coordinator only)` moved to `references/coordinator-course.md` section F; Coordinator, load it before registering a generic batch.

