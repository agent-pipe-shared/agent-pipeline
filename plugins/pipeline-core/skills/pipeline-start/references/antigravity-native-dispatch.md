# Native Antigravity dispatch preparation

Load this reference before an Elephant or other authorized dispatcher builds
an Antigravity `invoke_subagent` call whose complete `Subagents` array includes
a Pipeline role. It is a preparation and admission route, not a launcher: do
not start another `agy` process, execute a model, add approval, or replace the
existing Workflow/worktree route.

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

For a rejection, keep the reported code distinct. Correct the closed request
or recreate a fresh preparation only for an unlaunched batch. Never invent a
packet, erase an artifact, retry a launched job, or treat preparation as model
execution or acceptance. Fresh Critic packets retain their refs-only evidence
boundary and all existing role and consent policy applies.
