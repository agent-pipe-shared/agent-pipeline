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

### Native Goldfish dispatch (measured, candidate 20 G20-8 B)

Measured shape of the host tool (`w252-agy-native-subagent-measurement.md`): `invoke_subagent` takes FLAT arguments, `TypeName`, `Role`
and `Prompt` required, `Model` one of `inherit|flash_lite|flash|pro`, `Workspace` one of `inherit|branch|share`; there is no `Subagents`
array. In a hook payload the arguments may be JSON-string-encoded (`Model` arrives as the string `"flash"` with its quotes); the guard
decodes one level. Build the call from the briefing the generator produced (`dispatch-briefing.mjs build --runner antigravity`, a native
alias as the model id) and set `Model` to the alias the dispatch selection names for the role.

- **Admission** is the one Claude uses: the generated briefing route, the selected model and the write-capable carrier are judged by
  `guard-dispatch`. There is no per-dispatch PO consent and no signature, and no prepare step for these three roles (the prepared
  one-shot artifact stays the route of the read-only roles above).
- **Parent binding.** Every child hook call carries its own `conversationId` and no parent field. The host writes
  `<brain root>/<parentConversationId>/.system_generated/subagents/<childConversationId>.json`
  (`{conversationId, subagentDescriptor{typeName, role}, state, spawnStepIndex, workspaceUris}`); the brain root is the parent directory
  of the payload's `artifactDirectoryPath`. A child is bound when exactly one parent directory holds a descriptor named after it
  (`lib/agy-native-goldfish.mjs`). The guard refuses agent writes under the Antigravity brain and config directories
  (`AGY-NATIVE-BRAIN-WRITE`).
- **Model.** The alias exists only in the parent call; every child call carries the RESOLVED `modelName`, and `flash` and `pro` resolved to the
  same model on the measured host. The guard compares the child's `modelName` with the model the dispatch selection resolved for its role
  (the registry's Antigravity cell for that duty), never with the alias, and refuses a mismatch with `AGY-NATIVE-CHILD-MODEL-MISMATCH`
  naming both values and the repair.
- **Isolation (measured, M4b).** A code-writing child is dispatched with `Workspace: "branch"` (every other value, absent included, is
  refused: `AGY-NATIVE-WORKSPACE-NOT-ISOLATED`). The host then creates a real git worktree of the project below
  `<home>/.gemini/antigravity-cli/worktrees/<parentConversationId>/subagent-<...>` on a new branch of the same name, cut from the parent's
  COMMITTED HEAD: uncommitted parent changes are not in it, so a parent tree with uncommitted tracked changes is refused before dispatch
  (`AGY-NATIVE-WORKTREE-UNCOMMITTED`, repair: commit first; untracked files are not checked, but the child sees none of them). Several code
  writers may run in parallel, in one call or several; there is no one-per-call and no alive-count rule, because a finished child's descriptor
  stays `SUBAGENT_STATE_ALIVE`. Read-only roles are unaffected.
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
  commit is then the existing recovery route (`scripts/goldfish-host-commit-recover.mjs plan|apply`). The host owns the worktree and the
  branch; do not remove them.
- **Delivery.** The child runs in the background and its completion message arrives in the SAME parent turn, at the next model
  invocation, as a `<SYSTEM_MESSAGE>`; the parent does not need to end its turn.
- **Hand-back and commit.** Hooks govern the child (see above): its writes, shell and commits pass the same PreToolUse guard and a denial
  reaches it verbatim. The child commits on its own branch; the Elephant's commit is the take-over above followed by the existing
  `scripts/goldfish-host-commit-recover.mjs` plan/apply route. There is no Antigravity-only commit mechanism and no in-session
  implementation by the Elephant as a sanctioned route.
- **Not measured, so not assumed.** The spelling of `modelName` (the model check above is kept as it was), the descriptor state of a killed or
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

Resolve the already loaded plugin root first. The required entrypoint is
`scripts/antigravity-native-dispatch-prepare.mjs` below that root. Build one
closed JSON request file with exactly `packets` and `Subagents` (it may also
carry `root`). `packets` is the complete shared role-dispatch packet array and
`Subagents` is the complete native array in the same order, including any
host-defined members mixed with Pipeline roles. Preserve every role, prompt,
and array position; do not prepare only Pipeline members of a mixed array.

Run the existing CLI with its exact argv shape:

```text
node <loaded-plugin-root>/scripts/antigravity-native-dispatch-prepare.mjs prepare --root <repository-root> --request <native-dispatch-request.json>
```

Only after the command exits 0 and returns `status: "prepared"` may the
dispatcher call the native host tool. Pass only the returned
`invocation.Subagents` unchanged as the host tool's `Subagents` value. The
preparation binds the complete array, packets, repository root, candidate
commit/tree, and required-input digests. It publishes an expiring one-shot
artifact; the immediate PreTool check consumes it, rechecks those bindings,
and rejects replay, expiry, candidate movement, packet staleness, mutation,
and partial or reordered mixed arrays.

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
