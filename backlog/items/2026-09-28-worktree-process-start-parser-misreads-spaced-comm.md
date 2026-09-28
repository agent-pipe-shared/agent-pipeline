---
schema: pipeline.backlog-item.v1
id: pipeline.worktree-process-start-parser-misreads-spaced-comm
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Real synthetic Linux process replay on 2026-09-28; scratch/worktree-spaced-process-identity-probe.json, source 200014e939cfab9b8dcf0a82d9030955fb6c599b."
sprint: alfred
done_when: manual
---

# Worktree process ownership parses the wrong start time for spaced names

## Description

Both `localProcessStartIdentity` and `processStartIdentity` in
`plugins/pipeline-core/lib/worktree-lifecycle.mjs` split the complete
`/proc/<pid>/stat` line on spaces and take index 21. The parenthesized `comm`
field can itself contain spaces and closing parentheses. Those characters
shift that index away from kernel field 22 (starttime).

A real owned Linux test process with title `host worker (x)` reproduced this
on source `200014e939cfab9b8dcf0a82d9030955fb6c599b`. The current expression
returned `7`; parsing fields after the final closing parenthesis returned
the actual start ticks `2100258`. The inspected source SHA-256 was
`17639f3a42acc17dc041c50c205db281058e4cadfe12acfa5d9bf5645897dc73`.

The source can therefore persist or compare another numeric field as process
identity. This weakens the intended PID-reuse check and can misclassify owner
liveness. This replay proves incorrect parsing; it does not prove an exploited
PID-reuse scenario or an incorrect real cleanup decision.

## Affected artifact

`worktree-lifecycle.mjs` session-owner runtime, manifest-lock owner and temporary
resource creation identity. The separate `session-cleanup-recovery.mjs` parser
already locates the final closing parenthesis; its previous cleanup closure
is not invalidated by this different implementation defect.

## Proposal

Use one validated Linux starttime parser across the worktree identity call
sites: find the final `)`, parse the remaining fixed fields and require a valid
numeric field 22. Keep existing unavailable/platform semantics explicit.
Do not replace an unreadable Linux identity with a success claim based only
on the numeric PID. Preserve the callers' current scope and liveness policy.

## Acceptance

- A real Linux process with spaces and parentheses in its title yields the
  kernel's actual start ticks at both identity call sites.
- Malformed, missing and inaccessible stat data preserve typed unavailable or
  fail-closed behavior; they do not create a verified start identity.
- Existing owner/manifest/temp-resource identity and cleanup fixtures pass.
- A reused PID with a different actual start time is not treated as the owner,
  including when both process names contain spaces.
- The fix is integrated and bound to the final 0.7 candidate; a scratch
  reproduction alone does not close the item.

## Triage

Confirmed during Codex host process-supervisor preparation. Relevant to
reliable process ownership and recovery; not an observed credential leak or
proven cleanup exploit. Scratch-only supervisor uses the correctly delimited
parser already. Canonical worktree source remains unchanged and this item open.
