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
| `goldfish-implementor` | not native: `invoke_subagent` is refused (`AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE`) | The one sanctioned entry is `scripts/elephant-implementation-dispatch.mjs` (below). It is documented as the Codex-to-Antigravity route; launched from an Antigravity-hosted Elephant it has not been shown to return. |
| `goldfish-mechanic`, `goldfish-deep` | not available | The V3 registry marks both `unavailable` on Antigravity; only the implementor is opt-in. |

`dispatch-briefing.mjs` builds the Claude and Codex briefing block. An
Antigravity dispatch does not use it (a Gemini model id is refused there with
a note saying so); the implementation route reads a
`pipeline.role-dispatch-request.v1` packet (`transport: "antigravity"`,
`resultDestination: { kind: "return" }`) and takes provider, model, effort and
scope from its own V3 route and the stored session consent.

### Implementation from an Antigravity-hosted Elephant

```text
node <loaded-plugin-root>/scripts/elephant-implementation-dispatch.mjs dispatch --root <repository-root> --request <role-dispatch-request.json under the root> --result-path <new relative output file> --session-id <session id> --descriptor-sha256 <descriptor sha256>
```

Make at most one attempt and never retry a launched job. The receipt carries an
`advisory` (`AGY-HOSTED-ELEPHANT-UNPROVEN`) when the caller is an Antigravity
session. If the status is anything but `authored-commit-recorded`, stop and ask
the PO how implementation is to be dispatched; do not write the implementation
yourself unless the PO decides so. The child gets no stdin and is killed after
its bounded timeout.

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

After a read-only role was dispatched with `invoke_subagent`, end the parent
turn without further tool calls. Observed in the first greenfield run: the
Critic's message stayed under `.system_generated/messages/undelivered/` and the
subagent never ran while the parent kept working in the same turn; the review
was then finalized in the main context, which is not an independent review.
The runner's delivery rule itself is not verified here, so treat ending the
turn as the safe form. Read the result in the next turn, from the files the
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
