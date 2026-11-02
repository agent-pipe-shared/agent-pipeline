# Happy path: onboarding ready to pushed (ordered, per runner)

Load this when a project is `ready` and the next question is "what do I run now". It is an index in lifecycle order, not a second rule file: every
step names the reference that owns the detail, and every command below was taken from that owner or from the script's own refusal text. A step
marked **no syntax documented** has no complete command line in any shipped document; run the verb without flags and read what it asks for.

Conventions. `PLUGIN` is the absolute `pluginRoot` printed by the ready preflight (`node "${PIPELINE_PLUGIN_ROOT}/scripts/<script>"`); never a repository
`plugins/pipeline-core` path in a consumer repository. `pipeline-state.mjs` reads the project directory from `CLAUDE_PROJECT_DIR`, else the current directory
(there is no `--dir` flag). "PO" means a step only the human can run. Scratch files live under `scratch/`.

## 1. Design

1. `pipeline-state.mjs set-feature --id <id> --plan-path <path>` (agent). Both flags are required.
2. Review receipt and design course (agent): `design-review-receipt.mjs create` with `--repo --feature --report --prd --spec --out`; dispatch the
   read-only `pipeline-core:readiness-reviewer`, not the Critic. Owner: `references/design-course.md`. Never write a receipt by hand.
3. `pipeline-state.mjs submit-plan --by <name> --profile <epic|feature|mini>` (agent). A blocked planning fitness names its blocking classes; a class 9
   (profile drift) block is a repository state and names the adoption renewal.
4. `pipeline-state.mjs present-plan --by <name> [--review-receipt <repo-relative-json>]` (agent). Needs the exact current submission from step 3.
5. `pipeline-state.mjs approve-plan` (PO ceremony): in `signature` mode the flag `--by` is forbidden; in `chat` mode the PO's explicit actor name is
   required. A bootstrap acknowledgement receipt and a prior `present-plan` for this exact submission are required. **No further syntax documented**: follow
   the action `pipeline-state.mjs inspect` returns.
6. `register-feature-package.mjs --root <root>` (agent). It prints `commitPaths`: commit them BEFORE the binding is generated. After registration do not edit
   the PRD, Spec, `acceptance.md`, `result.md` or the envelope. Owner: `references/implementation-continuation.md`.
7. `pipeline-state.mjs set-phase --phase implementation` (agent). Source files stay out of the draft commit until then.

## 2. Implementation (one dispatch per task, from the template)

1. Select the model route: `model-role-dispatch-select.mjs --repo-root <absolute-repo> --runner <claude|codex|antigravity> --task-route <registered-route>`;
   Antigravity adds `--host-session-id <id from this session's native hook>`.
2. Generate the binding: `dispatch-briefing.mjs binding --root <root> --dispatch-id <id> --item <slug> --criterion AC-<n> --agent-type <type> --model-id <model> --check <node test> --path <...>`
   and put its `skeleton` (or `block`) first in the briefing filled from `templates/prompts/goldfish-task.md`. A directory in `--path` ends with `/`.
3. Dispatch by runner:
   - **Claude**: `Agent` / `Task` with the functional `agentType`.
   - **Codex**: `spawn_agent` with `nativeAgentType: "worker"`, keeping the `pipeline-core:goldfish-implementor` (or `-mechanic`) role.
   - **Antigravity**: `antigravity-native-dispatch-prepare.mjs prepare --root <repository-root> --request <native-dispatch-request.json>`; only after exit 0 and
     `status: "prepared"` call `invoke_subagent` with `invocation.Subagents` unchanged. A native implementation consent is not available: read
     `references/antigravity-native-dispatch.md` before the first dispatch and ask the PO when the sanctioned route does not return an authored commit.
4. Commit what the dispatch produced under the host-commit rules of its runner; never hand-build a record the writer refuses (the refusal names its repair).

## 3. Critic

1. `critic-dispatch-preflight.mjs` immediately before every Critic spawn, against the fixed base and candidate (`--base <ref> --candidate <ref>`, not `--range`;
   `--task-id` on every later round). Dispatch only on `pipeline.critic-dispatch-preflight.v1` = `packet-ready`. **No complete command line documented**; the refusal
   chain names the next step.
2. `session-critic-finalizer.mjs admit --root "$PWD" --request scratch/session-critic-finalization-request.json`, then dispatch one fresh read-only Critic
   (Antigravity: no external process; refs-only packets per `references/antigravity-native-dispatch.md`).
3. `session-critic-finalizer.mjs finalize --root "$PWD" --request scratch/session-critic-finalization-request.json`, then `... export --root "$PWD" --request scratch/session-critic-export-request.json`.
   `finalize --help` prints the closed request keys.
4. Findings: `register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>` or `--add-delta-request <input.json>`; every later round reuses the first `taskId`.

## 4. Close

Owner: `skills/close-feature/SKILL.md`. The coordinator returns the exact argv for each step; run it as returned, do not rebuild it from prose.

1. Package side: `verify-evidence-producer.mjs --mode candidate --out specs/<feature>/<name>.json`, then `register-feature-package.mjs --root <root> --add-verify-evidence <path>`,
   then `pipeline-state.mjs feature-package-plan` / `feature-package-apply` with `--next-state verifying`, and again with `--next-state completed` (one step at a time).
2. `close-coordinator.mjs plan-start --root <root> --lifecycle <id> --actor <name> --close-intent durable-stop`, apply the returned action, then
   `plan-transition` / `apply-transition` through `checkpointed`, `feature-close-prepared`, `tracked-close-finalized`, `candidate-frozen`, `final-verify-green`,
   `cleanup-complete` and `closed-local`. The cleanup receipt: `close-coordinator.mjs write-cleanup-receipt --root <repository-root> --lifecycle <id>` (before `closed-local`).
3. `pipeline-state.mjs close-feature --by "<name>" --architecture-impact "<value>" --coordinator-lifecycle "<id>" --coordinator-sha256 "<sha>"` plus
   `--continuity-close-request` when the returned argv carries it. **Antigravity** has one entry instead: `finish-feature.mjs --root <root> --by <actor> --architecture-impact <value> --audit-request <json> --critic-verify-lifecycle <id>`.
4. Telemetry row (Claude only): `usage-ledger.mjs`; on Codex and Antigravity skip it and say so in the close report.

## 5. Push

Owner: `docs/push-release-flow.md`.

1. `push-init.mjs --root <repo> --by <name> --remote <remote> --destination refs/heads/<branch>`: stops at the signature and prints the line for the PO.
2. PO terminal: `po-human-approval.mjs authorize-critical ... --kind push --subject-sha256 <hash> --expires-at <ISO-8601>` (the PO types the passphrase). In `chat` mode there is no proof file.
3. `pipeline-state.mjs approve-push --by <name> --remote <remote> --destination refs/heads/<branch>` with the proof flags in signature mode.
4. `git push <remote> <branch>:refs/heads/<branch>` (full refspec; never force). A stop at the runner's own prompt is the runner's gate, not a Pipeline refusal.

## What differs per runner (only rows with a source)

| Topic | Claude | Codex | Antigravity |
| --- | --- | --- | --- |
| Dispatch carrier | `Agent` / `Task`, functional `agentType` | `spawn_agent`, `nativeAgentType: "worker"` | `antigravity-native-dispatch-prepare.mjs`, then `invoke_subagent`; implementation is not native |
| Mechanic and deep tiers | available | see `config/runner-profiles-v3.json` | `unavailable` there |
| Tool budget | per-agent counter; a grant raises it | nothing counts it (the briefing says so) | nothing counts it (the briefing says so) |
| Dispatch record model | host-observed | declared, labelled unobserved | see `references/antigravity-native-dispatch.md` |
| Own session descriptor at close | derived for Claude | derived for the closing runner | derived for the closing runner |
| Close entry | coordinator route | coordinator route | `finish-feature.mjs` single entry |
| Telemetry row at close | `usage-ledger.mjs` | not available | not available |
| Push second gate | host classifier (settings entry) | runner prompt, not measured | runner prompt, not measured |

A row that is missing here has no source in this repository; ask the PO instead of assuming it.

## Gaps this guide does not close

- Complete lines for `approve-plan`, the `critic-dispatch-preflight.mjs` call and the `plan-transition` phases are not documented anywhere; this guide does not invent them.
- `--architecture-impact` accepts a different value list in the close-feature skill and in the Antigravity close reference; use the list the returned argv or `--help` prints.
- Nothing here has been run end to end on Codex or Antigravity.
