---
schema: pipeline.backlog-item.v1
id: pipeline.the-handover-size-guard-only-sees-one-of-two-write-paths
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_repository: self
closure_commit: 7e929b6a1a1606530dff0307cd89f47467981d1f
closure_evidence: plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs
created: 2026-09-01
source: "Direct measurement, 2026-09-01: docs/state.md found at 30115 bytes, already over the guard's own 30000-byte cap."
sprint: nova-b
---

## Closure, 2026-09-01

Closed after three commits and two independent Critic rounds.

`54fb5006` added the commit-boundary check, closing the Bash/Node write-path gap
the item describes. The first Critic round found that the check established a
blob's size by reading its full content through a pipe with Node's default 1 MiB
buffer, and read HEAD before the shrink escape route — so a committed handover
over 1 MiB blocked every commit that staged the file, including a shrink to one
byte. The message the design offered for the blocked case was unreachable exactly
when it was needed.

`7bca7f5d` repaired that by measuring with `git cat-file -s`, which returns the
recorded byte count without emitting content, and by matching the configured path
by resolved absolute path rather than by raw string equality — the way the
mirrored PreToolUse guard matches it.

The second Critic round returned a consistent trajectory with no blocker. It
verified rather than accepted the mirroring claim, confirmed the fix lands in the
emitted hook and not only in the installer, and found one real gap: coverage of
the staged fail-closed branch had gone from one test to zero on a line the fix
edited. `7e929b6a` restores it, proven by inverting the production branch and
measuring the new test red before restoring.

Both halves of the original defect are now pinned end to end: a 2 MiB committed
blob shrinking to six bytes is admitted, and neither fail-closed branch can be
loosened without the suite going red. Suite 39 → 45.

# The handover size guard only sees one of two write paths, and once over its cap it blocks the shrink that would fix it too

## Description

`guard-handover-size.mjs` is a PreToolUse hook attached to Edit/Write. It
blocks a proposed write when `proposedBytes >= maxBytes` (its line ~154).
`HANDOVER_MAX_BYTES` is defined as `30000`
(`plugins/pipeline-core/lib/handover-rotation.mjs`, line 41).

On 2026-09-01, `docs/state.md` was measured directly at **30115 bytes** —
already past the 30000-byte cap. The guard had not stopped whatever growth
put it there.

## Cause

Every growth of `docs/state.md` on 2026-09-01 was applied by a Node script
run through Bash (not an Edit/Write tool call). `guard-handover-size.mjs`
only fires as a PreToolUse hook on Edit/Write; a Bash-invoked script writing
the same file through Node's own filesystem API never passes through that
hook, so nothing measured the file's size before that write landed.

## Consequence

Not merely that the cap was exceeded once. Once `docs/state.md` sits over
30000 bytes, the guard blocks every SUBSEQUENT Edit/Write against it —
**including one that would only shrink the file**, because the guard's
condition (`proposedBytes >= maxBytes`) does not distinguish a write that
grows the file further from one that would bring it back under the cap, as
long as the proposed result is still at or above 30000 bytes. This locks out
the Edit/Write ("tool") lane from repairing what the Bash/Node ("script")
lane put the file into.

## Mitigating fact

The guard's own refusal text names a way out: a write that is itself a net
size DECREASE relative to the file's current bytes is always admitted,
regardless of the absolute resulting size. `handover-rotate.mjs`'s own
rewrite is admitted for exactly this reason — a rotation that shrinks the
file passes even while the file is over cap. The lockout above applies only
to a same-lane write that does not itself reduce the file's size below its
current bytes (e.g., another script-lane append, or an Edit/Write growing it
further) — not to every possible repair.

## Affected artifact

`plugins/pipeline-core/hooks/guard-handover-size.mjs` (the PreToolUse hook);
`plugins/pipeline-core/lib/handover-rotation.mjs` line 41 (the shared
`HANDOVER_MAX_BYTES` constant and measurement logic).

## Proposal — options only, no decision made here

1. **A matching check in the rotation/measurement library that any writer
   can call**, so a script-lane writer (Node script run via Bash) can invoke
   the same size check `guard-handover-size.mjs` uses before it writes,
   rather than relying on a PreToolUse hook that only sees one of the two
   write paths.
2. **A post-write verification** — a step, run after any write to
   `docs/state.md` regardless of lane, that measures the resulting file and
   surfaces (or blocks a subsequent commit on) an over-cap result.
3. **Accept the gap explicitly and document the script lane as out of
   scope** for `guard-handover-size.mjs`, on the basis that PreToolUse hooks
   are inherently tool-call-scoped and a Bash-invoked script is a different
   enforcement surface — paired with fixing the lockout side so an
   over-cap file can always be shrunk regardless of which lane attempts it.

None of these three is recommended over another here.
