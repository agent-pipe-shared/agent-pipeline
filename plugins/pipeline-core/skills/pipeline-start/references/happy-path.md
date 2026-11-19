# Happy path: onboarding ready to pushed (ordered, per runner)

Load this when a project is `ready` and the next question is "what do I run now". It is an index in lifecycle order, not a second rule file: every
step names the reference that owns the detail, and every command below was taken from that owner or from the script's own refusal text. A step
marked **no syntax documented** has no complete command line in any shipped document; run the verb without flags and read what it asks for.

Conventions. `PLUGIN` is the absolute `pluginRoot` printed by the ready preflight (`node "${PIPELINE_PLUGIN_ROOT}/scripts/<script>"`); never a repository
`plugins/pipeline-core` path in a consumer repository. `pipeline-state.mjs` reads the project directory from `CLAUDE_PROJECT_DIR`, else the current directory
(there is no `--dir` flag). "PO" means a step only the human can run. Scratch files live under `scratch/`.

Runbooks. Each path below also exists as a generated machine-readable runbook (`runbooks/<path>-path.v1.json` in the plugin, listed by
`runbooks/index.v1.json`): the start, plan, implement, critic, close and push paths, each step with its preconditions, exact command, evidence and next step.
The first call of a standard command returns a typed `runbook` field `{ path, digest, step }` naming the runbook of its path and its own step (once per
session and path, and always on a refusal); follow that runbook when this guide and the command's own output differ, because it is regenerated from the
command tables.

Escalations (G20-45). The user's recorded onboarding consent covers every agent step up to presenting the design (hooks, onboarding commits, intake and
kickoff artifacts, the unsealed-draft bind, the review rounds, `submit-plan`, `prepare-seal`, `present-plan`); the design approval, push, release and any
human-guard override are not covered. An action the consent covers prints `requiresConfirmation: false`, `coveredBy` (the record path and the step) and
`escalationJustification`: when a runner's escalation review asks for a reason to run it (Codex mounts `.git` read-only, so every lifecycle write is
escalated), give that line verbatim. Without a record nothing is marked covered.

Before you put anything in front of the PO for acceptance or to try out, make sure you have seen it work yourself (PO decision 2026-11-10):
start or open it the way the PO will and look at what it really shows. Then tell the PO in one line what you saw, or plainly that you could not
see it and why. This holds for every kind of result (an app, a page, a command-line tool, a library, a document) and for every hand-over, not
only the acceptance question at the close. It is not a gate: the Pipeline cannot check what you saw, only you can.

The acceptance question of the one-shot close is asked after the candidate Verify has passed (a red or dirty Verify stops with `ONESHOT-VERIFY-RED` and the human is never asked); the stop is after writes, so do not commit what the Verify wrote: the rerun with the answer discards it and runs the Verify again. It is asked in the project's human-facing language (German for a German project, English for any other language) and names a closed list of clear yes forms of that language (`yes, I accept`, `yes`, `yes, accepted`, `accepted`, `I accept`; `ja, ich akzeptiere`, `ja`, `ja, akzeptiert`, `akzeptiert`, `ich akzeptiere`) and, since PO decision 2026-11-17, a closed list of plainly positive answers (`good`, `ok`, `approved`, `great`, `looks good`; `gut`, `passt`, `ok`, `super`, `einverstanden`; the question names a few as examples; the signature before a push stays the final gate; a doubt, a negation or a "but" is never on it). Only a form on that list (case, commas, spaces and a closing `.` or `!` aside) is recorded as the acceptance through `--human-acceptance`; any other answer stops with `ONESHOT-ACCEPTANCE-NOT-YES` and records nothing. If the human answers anything else (a bug, a change request), rerun the identical command with `--human-decline "<the human's literal answer>"`: the words are recorded (never as an acceptance), the bound Result is retired, and the close returns `declined` with the correction steps in order: commit, correction dispatch, Critic delta round, then the identical close command with the new packet. Do not reopen the design for a declined acceptance (`reopen-design` refuses with a bound Result and names this route).

## 1. Design

1. `pipeline-state.mjs set-feature --id <id> --plan-path <path>` (agent). Both flags are required.
2. Review receipt and design course (agent): dispatch the read-only `pipeline-core:readiness-reviewer`, not the Critic; on Claude write its
   returned text as the report with `design-review-receipt.mjs export-report --repo <root> --out <report>` (the host-observed reviewer model,
   D247); then `design-review-receipt.mjs create` with `--repo --feature --report --prd --spec --out`. Owner: `references/design-course.md`.
   Never write a receipt or a report of the review by hand.
   Before the design is promoted, call the `architecture-decision` skill once for each of the design's decisions to record (title, trigger and ADR path in the module
   `adrReferences`); the readiness review asks about a missing one and the close readback lists which named paths exist. Neither blocks.
   Before the design review, `create-adr.mjs --root <root> --from-design` creates one proposal for every module `adrReferences` path that has no draft and no accepted record yet (titles from the slugs; `submit-plan` prints the same list as a notice).
   A decision the PO must accept with this design is a proposal first: `create-adr.mjs --root <root> --slug <slug> --title <title>` writes it (`--refresh` after an edit of the Markdown), then
   `bind-adr-proposals.mjs --root <root> --feature <id> --carrier <design.md> --selection <po-selection.json> --draft <slug>` binds it into the carrier and prints every companion path the review receipt must carry. Run both before the receipt.
3. `pipeline-state.mjs submit-plan --by <name> --profile <epic|feature|mini>` (agent). A blocked planning fitness names its blocking classes; a class 9
   (profile drift) block is a repository state and names the adoption renewal.
   **PRD release scope (every profile but `mini`, EL-19): the design package is an unsealed DRAFT** (`inspect` -> `sealSituation.situation` is `draft`); onboarding
   binds no digest, so the PRD and the Spec stay editable until the approval. Review the package, then step 3b. A `mini` package binds the digests as before.
3b. `pipeline-state.mjs prepare-seal [--review-receipt <repo-relative-json>]` (agent, draft packages only; run after step 3, and again after any edit of the PRD, the Spec or
   the design input). It writes `scratch/seal-plan.json` (the digest-bound seal plan) and never State; it also replaces a damaged plan file. `inspect` -> `sealSituation`
   names the next command in every state (`none`, `draft`, `bound-unapproved`, `sealed`).
4. `pipeline-state.mjs present-plan --by <name> [--review-receipt <repo-relative-json>]` (agent). Needs the exact current submission from step 3 and, for a draft, the prepared seal plan (step 3b):
   present the plan to the PO; its digest is part of what the one signature covers. Pass every receipt of the review chain, initial first; while the last one is `open-findings` and a delta round is left it refuses (`PLAN-DESIGN-REVIEW-OPEN`) until a delta round passes; the review is one full round and at most two delta rounds, and after round 3 the open findings go to the PO's signature (C30-6). This step and `set-phase implementation` also check the scanners the close will need: in a critical calibration a missing one is refused here with its install guidance or the named exception route, otherwise it prints a notice. Ask the PO to install it now, while nothing waits on it. The first `pipeline-start-preflight` output carries the same facts in `environmentReadiness` once the project's manifest enables scanners.
   Before asking for a signature on a design that changes the architecture rules of code that already exists, preview what the check will say: `architecture-boundary-check.mjs --root <root> --preview-prd <repo-relative PRD path>` (read-only, no signature, writes nothing). It checks the tracked tree against the modules of the PRD's PROPOSED design block, with the same rules as the real check (ownership, forbidden dependency, line bound); the map that the real check reads exists only after the signature. Fix the PRD, not the code, when it names a finding the design should have allowed. A pass is a preview, not an approval.
5. `pipeline-state.mjs approve-plan` (PO ceremony): in `signature` mode the flag `--by` is forbidden; in `chat` mode the PO's explicit actor name is
   required. A bootstrap acknowledgement receipt and a prior `present-plan` for this exact submission are required. **No further syntax documented**: follow
   the action `pipeline-state.mjs inspect` returns. Whenever you wait for a PO signature (this one, a push, a residual acceptance), the
   same message gives the PO the exact signing command, relayed verbatim from the tool output that printed it; never announce that you
   wait for a signature without it (live 2026-11-10: the PO had to ask where the command was). **For a draft package this one signature is the seal:** the approval writes the PRD and Spec digests into the State in the
   same transaction. A project bound before this change (`bound-unapproved`) stays locked until its approval; `pipeline-state.mjs reopen-design --by <name>` is executable in
   every state (it voids a prepared seal plan, unlocks a bound package, releases a sealed one); the refusals about a draft or a bound package name it as an exit.
   It is the PO's own step, run in the PO's own terminal: the guard refuses it from an agent (`PO-REOPEN-HUMAN-ONLY`) and admits only the preview
   `reopen-design --by <name> --dry-run`. A correction of the approved Spec during implementation needs no reopen: it is a Spec addendum with one PO approval (ADR-0095).
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

**One command:** once the package names its model from step 1, `prepare-dispatch.mjs goldfish --root <root> --package <package.json> [--no-goldfish-running]` probes it (all failures at once), builds the briefing, runs the Codex preparation where the runner needs it, and prints the exact next call in `next`. Pass `--no-goldfish-running` only when no Goldfish is running: then a pending registry heal runs once; otherwise the heal command comes back in `beforeDispatch`. The steps below explain it and remain the fallback. `prepare-dispatch.mjs --help` lists every flag.

1. Select the model route: `model-role-dispatch-select.mjs --repo-root <absolute-repo> --runner <claude|codex|antigravity> --task-route <registered-route>` (a Goldfish implementation uses `duty.implement`, deep work `duty.deep`; a refusal lists all routes);
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
   The package `id` of a module dispatch is that module's slice id from the proposal (`slice-<module>`; a further attempt on the same module:
   `slice-<module>-r2`, `-r3`, ...): the waves track a module by this id only, so any other id is refused with `DBG-MODULE-SLICE-ID`.
   A documentation-only module (every owned path is a document: `docs/` or `.md`, `.mdx`, `.txt`, `.rst`, `.adoc`) names one of its own documents as the check, `document:<owned path>` (package `check`, `--check`), and the host verifies that the delivery changed it as a non-empty committed file; a code module keeps a test it owns or `command:<id>`.
3. Dispatch by runner:
   - **Claude**: `Agent` / `Task` with the functional `agentType`.
   - **Codex**: Codex runs no PreToolUse hook for `spawn_agent`, so the governed admission is run by hand first. Write the briefing (`dispatch-briefing.mjs build --package <package.json> --out scratch/<briefing>.md`),
     run `codex-native-dispatch-prepare.mjs prepare --root <repository-root> --briefing scratch/<briefing>.md` (it performs the guard's admission: route record, governed queue row, pending state; a refusal carries the guard's
     code and repair and leaves no state), and only after exit 0 and `status: "prepared"` call `spawn_agent` with exactly the printed `spawn_agent.agent_type` (`worker`) and `spawn_agent.message`, keeping the
     `pipeline-core:goldfish-implementor` (or `-mechanic`) role, within the printed `bindWindowSeconds`. Preparing the same briefing again is safe. A `worker` started without a prepared dispatch gets a SubagentStart notice that its work will not be integrated. Wait with `wait_agent` and `timeout_ms: 300000`: a worker runs for minutes and every shorter poll costs a turn.
   - **Antigravity**: `antigravity-native-dispatch-prepare.mjs prepare --root <repository-root> --request <native-dispatch-request.json>`; only after exit 0 and
     `status: "prepared"` call `invoke_subagent` with the fields of the returned `invocation` unchanged (the host takes flat arguments, one child per call). A native implementation consent is not available: read
     `references/antigravity-native-dispatch.md` before the first dispatch and ask the PO when the sanctioned route does not return an authored commit.
4. Commit what the dispatch produced under the host-commit rules of its runner; never hand-build a record the writer refuses (the refusal names its repair).
   On Claude the host commit of a background Goldfish lands at its SubagentStop. Its hand-back message can arrive before that commit, and the later
   "Agent finished" task-notification starts no turn. So when the hand-back arrives, run the exact `wait-host-commit.mjs` command from the launch notice in that same turn,
   run it once more on `still-waiting`, and dispatch the next ready slice from its answer (after a compaction, `--help` names what to pass instead of the launch time). While ready
   slices remain, never end a turn with a status report or to wait for the pipeline to commit; a turn that ends there waits for the PO.
5. After the last slice and before the project's Verify, where the project has an architecture model: `architecture-fitness.mjs --root <root> --check` and `architecture-boundary-check.mjs --root <root> --json` (both read-only). A violation is fixed before the Critic reads the candidate.

## 3. Critic

**One command:** `prepare-dispatch.mjs critic --root <root> --spec <spec> --base <ref> --candidate <full commit id> [--guardrail <path>]... [--evidence <path>]... [--label <name> -- <command> <args>]` runs steps 0 and 1 and writes the admit request. With `--label` it stops once with `commit-required`: commit exactly its `commitPaths` in one evidence-only commit and run the identical command again. Its `next` names the placeholders only you can fill and the admit command. A refusal keeps the failed step's own code and repair. The steps below explain it and remain the fallback. `prepare-dispatch.mjs --help` lists every flag.

0. Collect the evidence the Critic reads, once per check, while the candidate is fixed: `critic-diagnostic-evidence.mjs --root <root> --spec <spec> --log specs/<feature>/evidence/<name>.log --out specs/<feature>/evidence/<name>.json [--candidate <ref>] -- <command> <args>`,
   then `register-feature-package.mjs --root <root> --add-diagnostic-evidence <path>` BEFORE committing (registration reads the working tree), then one evidence-only commit of artifact, log and manifest. The preflight in step 1 then takes `--registration-commit <that commit>`.
1. `critic-dispatch-preflight.mjs` immediately before every Critic spawn, against the fixed base and candidate (`--base <ref> --candidate <ref>`, not `--range`;
   `--task-id` on every later round). Dispatch only on `pipeline.critic-dispatch-preflight.v1` = `packet-ready`. The script has no `--help`; its argument refusal
   (`CDP-ARGUMENT`) names the complete flag set, each with a value: `--root --base --candidate --spec --guardrail --evidence --prior-critic --sweep-evidence --task-id
   --registration-commit --accepted-contract --criterion-locator --delta-request --correction-input-bindings`. The ones a first round needs are `--root`, `--base`,
   `--candidate`, `--spec`, `--guardrail` and `--evidence` (repository-relative paths for the last three); the refusal chain names the next missing input.
2. `session-critic-finalizer.mjs admit --root "$PWD" --request scratch/session-critic-finalization-request.json`, then dispatch one fresh read-only Critic
   (Antigravity: no external process; refs-only packets per `references/antigravity-native-dispatch.md`).
   Codex: both projected Critic roles, `critic` and `critic-high-risk` (a higher effort, from the `critic_high_risk` duty), carry a read-only sandbox, which a host may not be able to run. Run the preflight once on this machine (no model call): `node <plugin-root>/scripts/codex-sandbox-preflight.mjs --run --kind intermediate --codex <absolute codex path> --receipt <absolute path of a new file under scratch/>`. Then `node <plugin-root>/scripts/codex-critic-launch-route.mjs --role critic --receipt <that path>` (`--role critic-high-risk` for a higher effort; the receipt is optional; it always exits 0) prints one JSON object. Call `spawn_agent` with exactly the `agentType` it prints, which is the role itself (sandboxed) or `default`. With `default`, set the model and `reasoning_effort` on the call, record the round as `caller-authored-fallback` (it needs its one human acknowledgement at the close) and name the round in your final message as protected by instruction only. If a sandboxed Critic still fails on `EPERM` at run time, launch it once more through `default` with the same labelling.
3. `session-critic-finalizer.mjs finalize --root "$PWD" --request scratch/session-critic-finalization-request.json`. The close later exports each round's verdict into the feature by itself; `... export --root "$PWD" --request scratch/session-critic-export-request.json` is only for publishing fuller notes.
   `finalize --help` prints the closed request keys. A split review: `critic-split-merge.mjs --root <root> --packet <packetId>` once every child returned, before `finalize`.
   A round with no blocker or major finding, a consistent trajectory and no briefing violation has passed, whatever the Critic set for `pass`. Its minors stay open and need no further round; name them in your report.
4. Findings: `register-feature-package.mjs --root <root> --add-review-lineage --packet <packetId>` or `--add-delta-request <input.json>`; every later round reuses the first `taskId`.
   After fixing findings: `critic-correction-input-bindings.mjs derive --root <root> --base <commit> --head <commit> --out scratch/<file>` gives the file a delta preflight names with `--correction-input-bindings`.
5. Recovery only: a stale or conflicting round is read with `session-critic-finalizer.mjs inspect-course-takeover` and retired with `supersede-course-takeover`; nothing is deleted. Several units reviewed in one round: `register-batch`. All three take `--root` and `--request`.

## 4. Close

Owner: `skills/close-feature/SKILL.md`. **The normal entry on every runner is one command, after the Critic passed and its packet is consumed, on a clean tree:**

`finish-feature.mjs --one-shot --by <name> --architecture-impact <impact> [--root <root>] [--critic-packet-id <32-hex>] [--resume-lifecycle-id <id>]`

It collects the close evidence itself, in this order: candidate Verify bound to the Critic packet, its registration, the package moves to `verifying` and `completed`, the audit request, the Continuity Result bootstrap where the feature needs one, and the coordinator phases. It stops before Verify when the Critic acknowledgement is missing, asks the acceptance question after the Verify passed, prints the one commit the close needs, and every stop names its code and the rerun command. The Critic addenda of the dispatch records are its job as well: do not build them ahead (a `CRITIC-COVERAGE-PENDING` notice asks for nothing yet); the close writes them and stops once with `CLOSE-CRITIC-ADDENDA-WRITTEN` and the commit. A rerun after a commit qualifies the new HEAD again.

When the PRD's optional "User documentation" section names documents (ADR-0105), run `pipeline-core:reader-review` once on them before this command, resolve its findings or name them in your report. It is no gate: the close neither waits for it nor reads its result, and a PRD without the section needs nothing.

The single steps below are what it runs; use them for a recovery or when a stop names one. The coordinator returns the exact argv for each step; run it as returned, do not rebuild it from prose.

1. Package side: `verify-evidence-producer.mjs --mode candidate --out specs/<feature>/evidence/<name>.json`, then `register-feature-package.mjs --root <root> --add-verify-evidence <path>`,
   then `pipeline-state.mjs feature-package-plan` / `feature-package-apply` with `--next-state verifying`, and again with `--next-state completed` (one step at a time).
2. `close-coordinator.mjs plan-start --root <root> --lifecycle <id> --actor <name> --close-intent durable-stop`, apply the returned action, then
   `plan-transition` / `apply-transition` through `checkpointed`, `feature-close-prepared`, `tracked-close-finalized`, `candidate-frozen`, `final-verify-green`,
   `cleanup-complete` and `closed-local`. The shapes: `plan-transition --root <repository-root> --lifecycle <id> --actor <name> --phase <phase> [phase evidence options]`, then
   `apply-transition` with the same arguments plus `--plan-sha256 <sha256 of the plan> --activate`; `close-coordinator.mjs next <phase>` prints what a phase needs. The cleanup receipt: `close-coordinator.mjs write-cleanup-receipt --root <repository-root> --lifecycle <id>` (before `closed-local`).
   To step through these without composing each pair by hand, `close-coordinator.mjs drive --root <root> --lifecycle <id> --actor <name>` names the phase, the missing input and the remaining chain; with `--apply` it applies exactly one step and writes the cleanup receipt itself. It stops before every human-gate phase.
3. `pipeline-state.mjs close-feature --by "<name>" --architecture-impact "<value>" --coordinator-lifecycle "<id>" --coordinator-sha256 "<sha>"` plus
   `--continuity-close-request` when the returned argv carries it.
4. Telemetry row: `usage-ledger.mjs` on Claude; on Antigravity `usage-ledger.mjs --row <label> --antigravity-transcript <file>` and on Codex `usage-ledger.mjs --row <label> --codex-rollout <file>` give a token row plus an estimated dollar half from list prices (labelled), always printed as "approx" with the price table's date (the transcript or rollout path is an argument you pass).

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
| Dispatch carrier | `Agent` / `Task`, functional `agentType` | `spawn_agent`, `nativeAgentType: "worker"`, after `codex-native-dispatch-prepare.mjs` (Codex runs no PreToolUse hook for `spawn_agent`) | `invoke_subagent` (flat args); read-only roles after `antigravity-native-dispatch-prepare.mjs`, Goldfish roles from the generated briefing, no consent |
| Mechanic and deep tiers | available | see `config/runner-profiles-v3.json` | `unavailable` there |
| Tool budget | per-agent counter; a grant raises it | nothing counts it (the briefing says so) | nothing counts it (the briefing says so) |
| Dispatch record model | host-observed | declared, labelled unobserved | see `references/antigravity-native-dispatch.md` |
| Model exception | a PO-recorded, expiring exception admits one model outside the routing | not applicable (no tool-layer model parameter to admit) | not applicable (the native alias list is fixed) |
| Own session descriptor at close | derived for Claude | derived for the closing runner | derived for the closing runner |
| Close entry | `finish-feature.mjs --one-shot` | `finish-feature.mjs --one-shot` | `finish-feature.mjs --one-shot` |
| Telemetry row at close | `usage-ledger.mjs` | token row plus an estimated dollar half from list prices (labelled): `usage-ledger.mjs --row <label> --codex-rollout <file>` | token row plus an estimated dollar half from list prices (labelled): `usage-ledger.mjs --row <label> --antigravity-transcript <file> [--model <name>]` |
| Push second gate | host classifier (settings entry) | runner prompt, not measured | runner prompt, not measured |
| Signing preparation | the agent runs every preparation step; only the sign-off is the PO's | the agent runs every preparation step; only the sign-off is the PO's | the agent runs every preparation step; only the sign-off is the PO's |
| Observation boundary | tool-level only: the guard judges the runner's own tool calls, one hook serves the main session and a dispatched subagent alike, and an admitted `node` script can still read outside the repository; not covered: native read tools a runner does not route through the hook, plugin scripts reading their own inputs, and any operating-system boundary (a container, an own user or read-only mounts is the recommendation for teams that need one, not built) | tool-level only where the same guard runs; what a spawned worker's own scripts read outside the repository is not measured; not covered: native read tools the runner does not route through the hook, plugin scripts reading their own inputs, any operating-system boundary (OS encapsulation is the recommendation, not built) | tool-level only on the calls the prepare step admits; what a `node` script reads outside the repository is not measured; not covered: native read tools the runner does not route through the hook, plugin scripts reading their own inputs, any operating-system boundary (OS encapsulation is the recommendation, not built) |

A row that is missing here has no source in this repository; ask the PO instead of assuming it. The same table is machine-readable
(one source, checked against this one): `runner-capabilities.mjs --runner <claude|codex|antigravity>`.

## Gaps this guide does not close

- A complete line for `approve-plan` is not documented anywhere (it is a PO ceremony; follow the action `inspect` returns). The `critic-dispatch-preflight.mjs` flag set and the `plan-transition` shape above are taken from the scripts' own refusal text and usage; the per-phase evidence options of `plan-transition` are what `close-coordinator.mjs next <phase>` prints, and this guide does not invent them.
- `--architecture-impact` accepts a different value list in the close-feature skill and in the Antigravity close reference; use the list the returned argv or `--help` prints.
- Nothing here has been run end to end on Codex or Antigravity.
