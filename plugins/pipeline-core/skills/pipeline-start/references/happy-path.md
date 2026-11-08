# Happy path: onboarding ready to pushed (ordered, per runner)

Load this when a project is `ready` and the next question is "what do I run now". It is an index in lifecycle order, not a second rule file: every
step names the reference that owns the detail, and every command below was taken from that owner or from the script's own refusal text. A step
marked **no syntax documented** has no complete command line in any shipped document; run the verb without flags and read what it asks for.

Conventions. `PLUGIN` is the absolute `pluginRoot` printed by the ready preflight (`node "${PIPELINE_PLUGIN_ROOT}/scripts/<script>"`); never a repository
`plugins/pipeline-core` path in a consumer repository. `pipeline-state.mjs` reads the project directory from `CLAUDE_PROJECT_DIR`, else the current directory
(there is no `--dir` flag). "PO" means a step only the human can run. Scratch files live under `scratch/`.

Runbooks. Each path below also exists as a generated machine-readable runbook (`runbooks/<path>-path.v1.json` in the plugin, listed by
`runbooks/index.v1.json`): the start, plan, implement, close and push paths, each step with its preconditions, exact command, evidence and next step.
The first call of a standard command returns a typed `runbook` field `{ path, digest, step }` naming the runbook of its path and its own step (once per
session and path, and always on a refusal); follow that runbook when this guide and the command's own output differ, because it is regenerated from the
command tables.

## 1. Design

1. `pipeline-state.mjs set-feature --id <id> --plan-path <path>` (agent). Both flags are required.
2. Review receipt and design course (agent): `design-review-receipt.mjs create` with `--repo --feature --report --prd --spec --out`; dispatch the
   read-only `pipeline-core:readiness-reviewer`, not the Critic. Owner: `references/design-course.md`. Never write a receipt by hand.
   Before the design is promoted, call the `architecture-decision` skill once for each of the design's decisions to record (title, trigger and ADR path in the module
   `adrReferences`); the readiness review asks about a missing one and the close readback lists which named paths exist. Neither blocks.
3. `pipeline-state.mjs submit-plan --by <name> --profile <epic|feature|mini>` (agent). A blocked planning fitness names its blocking classes; a class 9
   (profile drift) block is a repository state and names the adoption renewal.
   **PRD release scope (every profile but `mini`, EL-19): the design package is an unsealed DRAFT** (`inspect` -> `sealSituation.situation` is `draft`); onboarding
   binds no digest, so the PRD and the Spec stay editable until the approval. Review the package, then step 3b. A `mini` package binds the digests as before.
3b. `pipeline-state.mjs prepare-seal [--review-receipt <repo-relative-json>]` (agent, draft packages only; run after step 3, and again after any edit of the PRD, the Spec or
   the design input). It writes `scratch/seal-plan.json` (the digest-bound seal plan) and never State; it also replaces a damaged plan file. `inspect` -> `sealSituation`
   names the next command in every state (`none`, `draft`, `bound-unapproved`, `sealed`).
4. `pipeline-state.mjs present-plan --by <name> [--review-receipt <repo-relative-json>]` (agent). Needs the exact current submission from step 3 and, for a draft, the prepared seal plan (step 3b):
   present the plan to the PO; its digest is part of what the one signature covers.
5. `pipeline-state.mjs approve-plan` (PO ceremony): in `signature` mode the flag `--by` is forbidden; in `chat` mode the PO's explicit actor name is
   required. A bootstrap acknowledgement receipt and a prior `present-plan` for this exact submission are required. **No further syntax documented**: follow
   the action `pipeline-state.mjs inspect` returns. **For a draft package this one signature is the seal:** the approval writes the PRD and Spec digests into the State in the
   same transaction. A project bound before this change (`bound-unapproved`) stays locked until its approval; `pipeline-state.mjs reopen-design --by <name>` is executable in
   every state (it voids a prepared seal plan, unlocks a bound package, releases a sealed one); the refusals about a draft or a bound package name it as an exit.
6. `register-feature-package.mjs --root <root>` (agent). It prints `commitPaths`: commit them BEFORE the binding is generated. After registration do not edit
   the PRD, Spec, `acceptance.md`, `result.md` or the envelope. Owner: `references/implementation-continuation.md`.
   When the push gate is configured `approval: required`, also run `pipeline-state.mjs materialize-push-threat-model` now (agent, no flags; it refuses
   if the file exists) and commit `project/push-threat-model.md` with the draft commit. A threat model first created at the Close moves the candidate
   after the Critic and Verify already ran, which forces a second round for no product change (Antigravity greenfield finding D4a).
   The `register-feature-package.mjs` result carries `pushThreatModel`: `present: false` names the command and says the file belongs in that same commit.
   This is enforced, not advice: while the push approval is active, `pipeline-state.mjs submit-plan`, `push-prepare.mjs` and the feature close
   (`feature-close-prepared`) refuse with `PUSH-THREAT-MODEL-MISSING`, `-EMPTY` or `-INVALID` (no markdown heading) and print the repair command and the commit rule.
7. Greenfield only: `pipeline-state.mjs materialize-architecture` (agent, no flags, no PO step). The approved PRD's architecture design block carries the
   scoped disposition; this writes the map, fitness model and baseline. Never take the `architecture-adoption.mjs prepare`/`apply` route in a greenfield
   repository (owner: `references/architecture-orientation.md`).
8. `pipeline-state.mjs set-phase --phase implementation` (agent). Source files stay out of the draft commit until then.

## 2. Implementation (one dispatch per task, from the template)

1. Select the model route: `model-role-dispatch-select.mjs --repo-root <absolute-repo> --runner <claude|codex|antigravity> --task-route <registered-route>`;
   Antigravity adds `--host-session-id <id from this session's native hook>`.
2. Generate the binding: `dispatch-briefing.mjs binding --root <root> --dispatch-id <id> --item <slug> --criterion AC-<n> --agent-type <type> --model-id <model> --check <node test> --path <...>`
   and put its `skeleton` (or `block`) first in the briefing filled from `templates/prompts/goldfish-task.md`. A directory in `--path` ends with `/`.
   Cut the dispatches along the modules of the design (`architecture/fitness-model.json`): one dispatch per module, with that module's `ownedPaths` as the
   `--path` scope, so the write scopes are disjoint and the dispatches can run in parallel. A design with a single module leaves no parallel slice; take
   that back to the design (the readiness question about decomposition) instead of splitting one module by file.
   `module-slice-proposal.mjs --prd <plan path>` prints that cut read-only: the waves from the module dependencies, the modules it serializes because
   their owned paths overlap, and the `slice-queue.mjs add` arguments; it writes no queue.
   The cut is enforced by `dispatch-briefing.mjs build` and `probe`: a briefing package that names `module` and `modulePlan` (the PRD with the design) takes its
   write scope from the module (the exact files its owned paths hold now, warning `DBG-MODULE-SCOPE-DERIVED`), is refused with `DBG-MODULE-SCOPE-CROSSES` when a
   declared path reaches another module, and with `DBG-MODULE-NOT-RUNNABLE` while a module it depends on has no accepted result.
3. Dispatch by runner:
   - **Claude**: `Agent` / `Task` with the functional `agentType`.
   - **Codex**: `spawn_agent` with `nativeAgentType: "worker"`, keeping the `pipeline-core:goldfish-implementor` (or `-mechanic`) role.
   - **Antigravity**: `antigravity-native-dispatch-prepare.mjs prepare --root <repository-root> --request <native-dispatch-request.json>`; only after exit 0 and
     `status: "prepared"` call `invoke_subagent` with `invocation.Subagents` unchanged. A native implementation consent is not available: read
     `references/antigravity-native-dispatch.md` before the first dispatch and ask the PO when the sanctioned route does not return an authored commit.
4. Commit what the dispatch produced under the host-commit rules of its runner; never hand-build a record the writer refuses (the refusal names its repair).
   On Claude the host commit of a background Goldfish lands at its SubagentStop, before its completion report reaches you: read `git log -1` once and
   continue in the same turn with the next slice. Never end the turn to wait for the pipeline to commit; a turn that ends there waits for the PO.

## 3. Critic

1. `critic-dispatch-preflight.mjs` immediately before every Critic spawn, against the fixed base and candidate (`--base <ref> --candidate <ref>`, not `--range`;
   `--task-id` on every later round). Dispatch only on `pipeline.critic-dispatch-preflight.v1` = `packet-ready`. The script has no `--help`; its argument refusal
   (`CDP-ARGUMENT`) names the complete flag set, each with a value: `--root --base --candidate --spec --guardrail --evidence --prior-critic --sweep-evidence --task-id
   --registration-commit --accepted-contract --criterion-locator --delta-request --correction-input-bindings`. The ones a first round needs are `--root`, `--base`,
   `--candidate`, `--spec`, `--guardrail` and `--evidence` (repository-relative paths for the last three); the refusal chain names the next missing input.
2. `session-critic-finalizer.mjs admit --root "$PWD" --request scratch/session-critic-finalization-request.json`, then dispatch one fresh read-only Critic
   (Antigravity: no external process; refs-only packets per `references/antigravity-native-dispatch.md`).
3. `session-critic-finalizer.mjs finalize --root "$PWD" --request scratch/session-critic-finalization-request.json`, then `... export --root "$PWD" --request scratch/session-critic-export-request.json`.
   `finalize --help` prints the closed request keys.
4. Findings: `register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>` or `--add-delta-request <input.json>`; every later round reuses the first `taskId`.

## 4. Close

Owner: `skills/close-feature/SKILL.md`. The coordinator returns the exact argv for each step; run it as returned, do not rebuild it from prose.

1. Package side: `verify-evidence-producer.mjs --mode candidate --out specs/<feature>/evidence/<name>.json`, then `register-feature-package.mjs --root <root> --add-verify-evidence <path>`,
   then `pipeline-state.mjs feature-package-plan` / `feature-package-apply` with `--next-state verifying`, and again with `--next-state completed` (one step at a time).
2. `close-coordinator.mjs plan-start --root <root> --lifecycle <id> --actor <name> --close-intent durable-stop`, apply the returned action, then
   `plan-transition` / `apply-transition` through `checkpointed`, `feature-close-prepared`, `tracked-close-finalized`, `candidate-frozen`, `final-verify-green`,
   `cleanup-complete` and `closed-local`. The shapes: `plan-transition --root <repository-root> --lifecycle <id> --actor <name> --phase <phase> [phase evidence options]`, then
   `apply-transition` with the same arguments plus `--plan-sha256 <sha256 of the plan> --activate`; `close-coordinator.mjs next <phase>` prints what a phase needs. The cleanup receipt: `close-coordinator.mjs write-cleanup-receipt --root <repository-root> --lifecycle <id>` (before `closed-local`).
   To step through these without composing each pair by hand, `close-coordinator.mjs drive --root <root> --lifecycle <id> --actor <name>` names the phase, the missing input and the remaining chain; with `--apply` it applies exactly one step and writes the cleanup receipt itself. It stops before every human-gate phase.
3. `pipeline-state.mjs close-feature --by "<name>" --architecture-impact "<value>" --coordinator-lifecycle "<id>" --coordinator-sha256 "<sha>"` plus
   `--continuity-close-request` when the returned argv carries it. **Antigravity** has one entry instead: `finish-feature.mjs --root <root> --by <actor> --architecture-impact <value> --audit-request <json> --critic-verify-lifecycle <id>`.
4. Telemetry row (Claude only): `usage-ledger.mjs`; on Codex and Antigravity skip it and say so in the close report.

## 5. Push

Owner: `docs/push-release-flow.md`.

1. `push-init.mjs --root <repo> --by <name> --remote <remote> --destination refs/heads/<branch>`: stops at the signature and prints the line for the PO.
2. PO terminal: `po-human-approval.mjs authorize-critical ... --kind push --subject-sha256 <hash> --expires-at <ISO-8601>` (the PO types the passphrase). In `chat` mode there is no proof file.
3. `pipeline-state.mjs approve-push --by <name> --remote <remote> --destination refs/heads/<branch>` with the proof flags in signature mode.
4. `git push <remote> <branch>:refs/heads/<branch>` (full refspec; never force). A stop at the runner's own prompt is the runner's gate, not a Pipeline refusal.

## 6. Release (a consumer project: one version tag, the last step)

Owner: `docs/push-release-flow.md`, section "Releasing a consumer project". A consumer's release is the annotated tag `v<VERSION>` on the closed, pushed feature.

1. Before the Critic round, with the feature: `RELEASE-NOTES.md` gets a `## v<VERSION>` entry (closed feature id, title, acceptance criteria met). `VERSION` is tracked (onboarding creates it as `0.1.0`; an older project: `release-preflight-cli.mjs --init-version --root <repo>`, then commit).
2. `node "${PIPELINE_PLUGIN_ROOT}/scripts/release-preflight-cli.mjs" --root <repo> --base <registered base commit> --lifecycle specs/<feature>/lifecycle.json`. It stops at the first missing step (feature not closed, notes, Verify/Critic/security evidence, push approval, push) and prints the repair command. In `signature` mode it prints the PO's exact signing command for this subject (`RPC-CONSUMER-PO-APPROVAL`); in `chat` mode the run records the release approval. This is the one release approval of the whole path.
3. The `nextActions` it prints: `git tag -a v<VERSION> -m "version tag" <commit>`, then `git push <remote> refs/tags/v<VERSION>` (the push guard admits exactly that tag).

## What differs per runner (only rows with a source)

| Topic | Claude | Codex | Antigravity |
| --- | --- | --- | --- |
| Dispatch carrier | `Agent` / `Task`, functional `agentType` | `spawn_agent`, `nativeAgentType: "worker"` | `invoke_subagent` (flat args); read-only roles after `antigravity-native-dispatch-prepare.mjs`, Goldfish roles from the generated briefing, no consent |
| Mechanic and deep tiers | available | see `config/runner-profiles-v3.json` | `unavailable` there |
| Tool budget | per-agent counter; a grant raises it | nothing counts it (the briefing says so) | nothing counts it (the briefing says so) |
| Dispatch record model | host-observed | declared, labelled unobserved | see `references/antigravity-native-dispatch.md` |
| Own session descriptor at close | derived for Claude | derived for the closing runner | derived for the closing runner |
| Close entry | coordinator route | coordinator route | `finish-feature.mjs` single entry |
| Telemetry row at close | `usage-ledger.mjs` | not available | not available |
| Push second gate | host classifier (settings entry) | runner prompt, not measured | runner prompt, not measured |
| Signing preparation | the agent runs every preparation step; only the sign-off is the PO's | the agent runs every preparation step; only the sign-off is the PO's | the agent runs every preparation step; only the sign-off is the PO's |
| Observation boundary | tool-level only: the guard judges the runner's own tool calls, and an admitted `node` script can still read outside the repository; not an operating-system boundary | tool-level only where the same guard runs; what a spawned worker's own scripts read outside the repository is not measured | tool-level only on the calls the prepare step admits; what a `node` script reads outside the repository is not measured |

A row that is missing here has no source in this repository; ask the PO instead of assuming it. The same table is machine-readable
(one source, checked against this one): `runner-capabilities.mjs [--runner <claude|codex|antigravity>]`.

## Gaps this guide does not close

- A complete line for `approve-plan` is not documented anywhere (it is a PO ceremony; follow the action `inspect` returns). The `critic-dispatch-preflight.mjs` flag set and the `plan-transition` shape above are taken from the scripts' own refusal text and usage; the per-phase evidence options of `plan-transition` are what `close-coordinator.mjs next <phase>` prints, and this guide does not invent them.
- `--architecture-impact` accepts a different value list in the close-feature skill and in the Antigravity close reference; use the list the returned argv or `--help` prints.
- Nothing here has been run end to end on Codex or Antigravity.
