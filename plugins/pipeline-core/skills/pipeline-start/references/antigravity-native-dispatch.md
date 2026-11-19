# Native Antigravity dispatch preparation

Load this reference before an Elephant or other authorized dispatcher builds
an Antigravity `invoke_subagent` call whose complete `Subagents` array includes
a Pipeline role. It is a preparation and admission route, not a launcher: this
step does not start an `agy` process, execute a model, add approval, or replace
the existing Workflow/worktree route.

## Which route a role takes on Antigravity

| Role | Route | Notes |
|---|---|---|
| `critic`, `readiness-reviewer`, `plan-verifier`, `consult-advisor` (read-only) | this reference: prepare, then native `invoke_subagent` | Name the shipped Pipeline role as the `TypeName`. A runner-native type such as `research` is not a Pipeline role and is refused (`DISPATCH-WRITE-CARRIER-REQUIRED`): it carries no read-only guarantee. |
| `goldfish-implementor`, `goldfish-mechanic`, `goldfish-deep` | native `invoke_subagent`, admitted like a Claude `Agent` call: no prepare step, no PO consent, no signature (see "Native Goldfish dispatch") | `scripts/elephant-implementation-dispatch.mjs` (below) is the Codex-to-Antigravity route and is no longer the Antigravity-hosted Elephant's way to implement. |

`dispatch-briefing.mjs build|probe --runner antigravity` builds the Goldfish briefing (the model id is a native alias, `flash_lite`, `flash`
or `pro`, of the registry route; a Gemini model id is refused there). A read-only role is also described by a
`pipeline.role-dispatch-request.v1` packet (`transport: "antigravity"`, `resultDestination: { kind: "return" }`) for the prepare step
below; a code-writing Goldfish takes its provider, model and scope from the generated briefing and the registry route alone.

The runner view marks every shipped Pipeline agent subagent-only: besides the `model:` and `tools:` rewrites it writes `mainAgent: false`, `subagent: true`, `commandExecutionPolicy: sandbox` and `inheritCustomizations: true` before the closing frontmatter line (the Claude source files are unchanged; a source that already carries one of the four keys is refused `AGV-AGENT-KEY-CONFLICT`). So `agy --agent <name>` and `/agents` must not offer a role agent as the main session agent, which stays the Elephant, while `invoke_subagent` still starts it. `inheritMcp` is not set (open PO question). Open, an attended PO step: a real `invoke_subagent` per role on runner 1.5.10 and whether `mainAgent: false` changes what `agy agents` lists are not provable here.

### Native Goldfish dispatch (measured, candidate 20 G20-8 B)

Measured shape of the host tool (`w252-agy-native-subagent-measurement.md`): `invoke_subagent` takes FLAT arguments, `TypeName`, `Role`
and `Prompt` required, `Model` one of `inherit|flash_lite|flash|pro`, `Workspace` one of `inherit|branch|share`; there is no `Subagents`
array. In a hook payload the arguments may be JSON-string-encoded (`Model` arrives as the string `"flash"` with its quotes); the guard
decodes one level. Build the call from the briefing the generator produced (`dispatch-briefing.mjs build --runner antigravity`, a native
alias as the model id) and set `Model` to `flash` for the three Goldfish roles (a Critic dispatch passes no `Model`).

**`TypeName` is the BARE role name** (`goldfish-implementor`, `goldfish-mechanic`, `goldfish-deep`, `critic`,
`readiness-reviewer`, ...), never `pipeline-core:...`: the host refuses a colon in an agent name ("must start with a letter or
digit and contain only letters, digits, '_', '-', and '.'", measured live 2026-11-07). The guard admits the bare names on this
transport only. Do not `define_subagent` a Pipeline role yourself; `dispatch-briefing.mjs build` accepts either spelling.

- **Admission** is the one Claude uses: the generated briefing route, the selected model and the write-capable carrier are judged by
  `guard-dispatch`. There is no per-dispatch PO consent and no signature, and no prepare step for these three roles (the prepared
  one-shot artifact stays the route of the read-only roles above).
- **Parent binding.** Every child hook call carries its own `conversationId` and no parent field. The host writes
  `<brain root>/<parentConversationId>/.system_generated/subagents/<childConversationId>.json`
  (`{conversationId, subagentDescriptor{typeName, role}, state, spawnStepIndex, workspaceUris}`); the brain root is the parent directory
  of the payload's `artifactDirectoryPath`. A child is bound when exactly one parent directory holds a descriptor named after it
  (`lib/agy-native-goldfish.mjs`). The guard refuses agent writes under the Antigravity brain and config directories
  (`AGY-NATIVE-BRAIN-WRITE`).
- **Model (measured M4c/M10, G20-43).** The alias exists only in the parent call and does NOT select a model on the host: `flash` AND `pro`
  both resolved to `gemini-3.8-flash-tiered` (the child's hook payload `modelName`), and a child launched WITHOUT a Model inherits the main
  session's model (`gemini-4-argon-medium` measured). Routing (PO 2026-11-07): `goldfish-implementor` = flash medium, `goldfish-deep` =
  flash high, `goldfish-mechanic` = flash low, all dispatched with `Model: "flash"`; the Critic inherits (pass NO `Model`; an explicit
  alias on a Critic is refused by guard-dispatch with the repair "omit Model"). The guard compares the child's `modelName` with the
  registry's Antigravity cell for its duty and RECORDS the result (`modelCheck` in the verdict) with one stderr notice line
  (`agy-native-child-model-mismatch`) on a mismatch; it never denies for a model mismatch.
- **Isolation (measured, M4b).** A code-writing child is dispatched with `Workspace: "branch"` (every other value, absent included, is
  refused: `AGY-NATIVE-WORKSPACE-NOT-ISOLATED`). The host then creates a real git worktree of the project below
  `<home>/.gemini/antigravity-cli/worktrees/<parentConversationId>/subagent-<...>` on a new branch of the same name, cut from the parent's
  COMMITTED HEAD: uncommitted parent changes are not in it, so a parent tree with uncommitted tracked changes is refused before dispatch
  (`AGY-NATIVE-WORKTREE-UNCOMMITTED`, repair: commit first; untracked files are not checked, but the child sees none of them). Several code
  writers may run in parallel, in one call or several; there is no one-per-call and no alive-count rule, because a finished child's descriptor
  stays `SUBAGENT_STATE_ALIVE`. Read-only roles are unaffected.
- **When the host refuses `Workspace: "branch"` (measured, greenfield 2026-11-08).** Onboarding normally prevents this with its restart stop right after it creates the repository. The message says the language server did not detect a
  repository: the folder became a git repository after this Antigravity session started, and the host keeps that view for the session. Do not
  retry the same call and do not write the slice yourself, which is not a sanctioned route. Ask the PO once to restart Antigravity on this folder,
  run the bootstrap, and dispatch again; the project state is on disk and nothing is lost.
- **Governance of a branch child.** Its hook payload names the worktree first in `workspacePaths` and the project second. The guard resolves a
  worktree that the project repository lists (`git worktree list`) to that repository and governs the call with the project's governance, with
  every worktree path judged at the same relative path in the project; a worktree-shaped directory the repository does not list is refused
  (`AGY-NATIVE-WORKTREE-UNREGISTERED`). A child's file writes and shell working directory are confined to its own worktree
  (`AGY-NATIVE-CHILD-WRITE-OUTSIDE-WORKTREE`); only `brain/`, `config/`, `.system_generated/` and credentials of the host stay unwritable
  (`AGY-NATIVE-BRAIN-WRITE`), not the `worktrees/` directory.
- **Integration (the Elephant's take-over).** The child's commit lands at once in the shared object database on its branch; nothing is merged,
  copied or patched back, and the parent only receives the child's text message. After the child reported, run `scripts/agy-native-integrate.mjs
  plan --root <root> --branch <the child's branch> --allowed-path <briefed path>...` (read-only; `git worktree list` names the branch), then the
  same command as `apply` with the `--expect-sha256` digest it printed. `apply` writes the branch's net change into the working tree,
  uncommitted and unstaged; it refuses a path outside the briefed scope, a path with local changes and a change that no longer applies. The
  commit is then the existing recovery route (`scripts/goldfish-host-commit-recover.mjs plan|apply`). When `plan` reports
  `fastForward.eligible` (the branch was cut from the current HEAD and every commit carries the briefed `Dispatch: <id> (goldfish)`
  trailer), run its `fastForward.next` instead: `apply ... --keep-authorship <id>` lands the child's own commits unchanged (ADR-0099), and
  its `next` names the attested record over exactly those commits. Every other branch, typically the second of two parallel slices whose HEAD a
  sibling already moved, takes the one-call route that `plan`'s `next` prints: `apply ... --commit-dispatch-id <briefed id> --briefing
  <generated briefing file> --handback <file holding the child's hand-back text>` takes the change over, commits it with the dispatch trailer
  and writes the typed orchestrator-attested record in one call (`applyOnly` in the plan is the plain take-over without a commit). The host
  owns the worktree and the branch; do not remove them. To see what the child committed, stay in the project root: `git log <the child's branch>` and `git show
  <the child's branch>` read the shared object database, so no `git -C <worktree>` is needed. The tool budget is field 6 of the generated
  briefing and `guard-dispatch` reads it from there; nothing else is passed on the call. Neither step needs a look into the guard sources.
- **Briefing text, not a file pointer.** The generated `promptPointer` (`pipeline-briefing-file:` line) is admitted only in a direct
  Claude Agent call; an Antigravity call carrying it is refused `DBG-REF-CARRIER`. Pass the full generated briefing as `Prompt`,
  copied verbatim from the `--out` file including its final newline: the marker digest covers every byte, and a retyped or
  newline-trimmed text fails `DBG-GENERATED-DIGEST-MISMATCH`.
- **Delivery.** The child runs in the background and its completion message arrives in the SAME parent turn, at the next model
  invocation, as a `<SYSTEM_MESSAGE>`; the parent does not need to end its turn.
- **Hand-back and commit.** Hooks govern the child (see above): its writes, shell and commits pass the same PreToolUse guard and a denial
  reaches it verbatim. The child commits on its own branch; the Elephant's commit is the take-over above followed by the existing
  `scripts/goldfish-host-commit-recover.mjs` plan/apply route. There is no Antigravity-only commit mechanism and no in-session
  implementation by the Elephant as a sanctioned route.
- **Not measured, so not assumed.** The spelling of `modelName` beyond the two values above, the descriptor state of a killed or
  failed child, descriptor timing, a hook at a child's end, and whether a global (Pipeline) hook install fires once or twice per child tool call.

### Legacy route (Codex-to-Antigravity)

```text
node <loaded-plugin-root>/scripts/elephant-implementation-dispatch.mjs dispatch --root <repository-root> --request <role-dispatch-request.json under the root> --result-path <new relative output file> --session-id <session id> --descriptor-sha256 <descriptor sha256>
```

It is documented as the Codex-to-Antigravity route, takes a signed session consent, and is not how an Antigravity-hosted Elephant
implements. Make at most one attempt and never retry a launched job. The child gets no stdin and is killed after its bounded timeout.

Read-only carriers are named in the `DISPATCH-WRITE-CARRIER-REQUIRED` refusal: `pipeline-core:critic`, `readiness-reviewer`, `plan-verifier`,
`consult-advisor`. Prepare the call first with the command below. One example packet (field list: `schema`, `dispatchId`, `transport`, `role`,
`prompt`, `candidate{commit,tree}`, `requiredPaths`, `requiredPathSha256`, `resultDestination`):

```json
{ "schema": "pipeline.role-dispatch-request.v1", "dispatchId": "review-1", "transport": "antigravity", "role": "pipeline-core:readiness-reviewer",
  "prompt": "<briefing>", "candidate": { "commit": "<sha>", "tree": "<sha>" }, "requiredPaths": ["input.txt"],
  "requiredPathSha256": { "input.txt": "<sha256>" }, "resultDestination": { "kind": "return" } }
```

The closed request file of one child (flat host arguments around the packet; `Model` is one of `inherit|flash_lite|flash|pro` and is optional: a read-only role inherits, so `"inherit"` or no `Model` at all, never an explicit alias on a Critic):

```json
{ "packets": [ { "schema": "pipeline.role-dispatch-request.v1", "dispatchId": "review-1", "transport": "antigravity",
                 "role": "pipeline-core:readiness-reviewer", "prompt": "<briefing>" } ],
  "TypeName": "pipeline-core:readiness-reviewer", "Role": "pipeline-core:readiness-reviewer", "Prompt": "<briefing>",
  "Workspace": "inherit", "Model": "inherit" }
```

The Goldfish briefing package for `prepare-dispatch.mjs goldfish --package` / `dispatch-briefing.mjs build|probe` uses exactly these field names (copy and fill; the write scope is `paths`, never `ownedPaths`; unknown keys are refused):

```json
{ "schema": "pipeline.dispatch-briefing-package.v1", "id": "<dispatch id>", "item": "<item slug>", "agentType": "goldfish-implementor",
  "modelId": "flash", "check": "<node test path>", "title": "<title>", "ac": "AC-1", "goal": "<goal>",
  "paths": ["<repo-relative write path>"], "context": ["<file the dispatch reads>"], "targeted": ["<exact check command>"] }
```

Resolve the already loaded plugin root first. The required entrypoint is
`scripts/antigravity-native-dispatch-prepare.mjs` below that root. The host tool
takes FLAT arguments, so build one closed JSON request file per child with exactly
`packets` (one packet) and the child's own fields `TypeName`, `Role`, `Prompt`, plus
`Workspace` or `Model` only when that call passes them (it may also carry `root`).
A request with a `Subagents` array prepares a batch-shaped call the current host
does not issue: its artifact is never consumed and the host call fails with
`AGY-NATIVE-ARTIFACT-MISSING`.

Run the existing CLI with its exact argv shape:

```text
node <loaded-plugin-root>/scripts/antigravity-native-dispatch-prepare.mjs prepare --root <repository-root> --request <native-dispatch-request.json>
```

Only after the command exits 0 and returns `status: "prepared"` may the
dispatcher call the native host tool. Pass the fields of the returned
`invocation` unchanged as the host tool's arguments. The preparation binds the
call, packets, repository root, candidate commit/tree, and required-input digests.
It publishes an expiring one-shot artifact; the immediate PreTool check consumes
it, rechecks those bindings, and rejects replay, expiry, candidate movement,
packet staleness and mutation. `AGY-NATIVE-ARTIFACT-EXISTS` means a prepared
artifact for this exact call is still valid: issue the call now instead of preparing again.

A subagent dispatched with `invoke_subagent` runs in the background and in parallel with its siblings, and its completion message is
delivered in the SAME parent turn, at the next model invocation, as a `<SYSTEM_MESSAGE>` (measured, M5/M6): the parent need not end
its turn. An earlier reading of the first greenfield run, that the Critic's message stayed under
`.system_generated/messages/undelivered/` while the parent kept working, is contradicted by that measurement; do not finalize the
review in the main context, which is not an independent review. Read the result from the completion message and from the files the
Critic or reviewer wrote.

A Goldfish makes no parallel file writes in one turn until the hook race is
fixed: state this in every Goldfish briefing built for this route, and have the
Goldfish issue its `write_to_file` and Edit calls one at a time, each after the
previous result.

For a rejection, keep the reported code distinct. Correct the closed request
or recreate a fresh preparation only for an unlaunched batch. Never invent a
packet, erase an artifact, retry a launched job, or treat preparation as model
execution or acceptance. Fresh Critic packets retain their refs-only evidence
boundary and all existing role and consent policy applies.
