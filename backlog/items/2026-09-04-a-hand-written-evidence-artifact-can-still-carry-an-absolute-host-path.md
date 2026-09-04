---
schema: pipeline.backlog-item.v1
id: pipeline.a-hand-written-evidence-artifact-can-still-carry-an-absolute-host-path
type: defect
owner: pipeline
status: open
created: 2026-09-04
sprint: nova-b
done_when: manual
tracking: "Nova B — the second of the two directions named by the RED-capture item. The first direction shipped as a capture tool; this one is what that tool structurally cannot cover, and it is the half that catches a human or an agent writing an artifact by hand."
source: "Split out of backlog/items/2026-09-02-red-evidence-captured-from-node-test-embeds-the-absolute-repository-path.md, whose 'Direction to evaluate' section named two directions and whose remedy dispatch (NVA-B-REDCAPTURE-1, 2026-09-03/04) was scoped to the first one only. Filed so the parent item's closure does not bury the second."
---

# A hand-written evidence artifact can still carry an absolute host path

## What the capture tool does and does not reach

`plugins/pipeline-core/scripts/capture-evidence.mjs` runs a command, redacts
this machine's repository root and home directory from the captured bytes, and
refuses to write when a host path survives. That closes the case the parent item
was filed for: a `node --test` failure whose stack traces carry `file://` URLs.

It closes it only for output that passes through the tool. Every other route
into `backlog/evidence/` and `specs/*/evidence/` is untouched:

- an artifact composed by hand in a report or a summary,
- an agent writing an evidence file directly with its Write tool,
- output captured with a plain shell redirect and pasted in,
- a path quoted inside prose rather than inside a captured stack trace.

The parent item already stated this asymmetry plainly: "Option 2 catches
hand-written artifacts too, which option 1 cannot." Option 1 is now built. The
sentence about option 2 is still true, and there is now no item carrying it.

## Why the discretionary remedy is not enough, restated

This is the same argument the parent item made, and it has not weakened. The
remedy currently covering the hand-written route is a self-check at write time
plus dispatcher review. Both are discretionary. Both failed once each in a
single day (`NVA-REBDEAD-1` finding F6, dispatcher-side; `NVA-REBDEAD-F5B`,
dispatch-side), and one of those failures put a machine-specific absolute path
into commit `79bc79b8`, where it stays: rewriting history is prohibited outright
by the guard union, so there is no route that removes it.

A correction after `git commit` is structurally too late for this class. That is
why the check has to fire before the write, not after it.

## Direction to evaluate

A `PreToolUse` check on writes into `backlog/evidence/` and `specs/*/evidence/`
that refuses a payload containing an absolute host path — the same shape as the
existing `harness/scripts/check-consumer-safe-paths.mjs` sweep, but fired before
the write rather than as a later suite.

Three questions have to be answered before this is built, and none of them is
answered here:

1. **What a legitimate absolute path in evidence looks like, if such a case
   exists at all.** A refusal with no escape hatch is only correct if there is
   nothing correct to refuse. If there is, the escape hatch is the design.
2. **Whether the pattern vocabulary lives in one place or two.** The capture
   tool now owns a residual-path pattern list, and this guard would own a second
   one. Two lists that must agree and are edited separately is the drift shape
   this repository has paid for elsewhere; sharing them couples a `PreToolUse`
   hook to a script, which has its own cost.
3. **What it does to the containment surface.** Containment here is
   enumerated-deny, not an allow-list, and the guard has no concept of roles —
   so a new refusal applies to every writer, including the human.

## Not in question

The capture tool is not deficient for failing to cover this. A tool that runs a
command cannot see bytes that never pass through it, and widening its scope to
try would produce a worse version of the guard this item describes.

## Affected artifacts

- `backlog/evidence/` and `specs/*/evidence/` — every tracked evidence artifact
- `harness/scripts/check-consumer-safe-paths.mjs` — the nearest existing check;
  it runs over source files as a later suite, not over a payload before a write
- `plugins/pipeline-core/scripts/capture-evidence.mjs` — direction 1, shipped;
  the reason this item's scope is what it is
- `CLAUDE.md` — the hard rule both directions serve
