# Greenfield native guard-chain attempt — 2026-09-07

## Intended proof

Create a disposable local Git consumer with real V3 authority, use only the
sanctioned onboarding and intake commands to generate its checkpoint, then
send an absolute generated PRD path, a relative generated spec path, and a
bounded `scratch/` path through the native Codex `apply_patch` adapter. The
test must retain real concurrent guard probes and must not manufacture a
runtime receipt, a readiness receipt, or a PO approval.

## Captured results

`guard-apply-patch-red.txt` is the pre-change baseline despite its historical
filename: the existing 12-check suite exited 0. It does not exercise the
greenfield chain.

The owned test adds the real subprocess composition. Three host-authorized
attempts stopped while creating the fixture, before an intake checkpoint or
native guard decision was reachable:

| Capture | Result |
| --- | --- |
| `guard-apply-patch-green-attempt-1.txt` | `plan-partial-authority` exited 1 while creating the fixture. |
| `guard-apply-patch-attempt-2.txt` | The actual V4 authority inspection reported `status: partial`, `code: partial_authority`; repository was `local-valid-writable`, runtime was `not-observed`, continuity `unavailable`. |
| `guard-apply-patch-attempt-3.txt` | `plan-partial-authority` reported `status: not-applicable`, `code: partial_authority_not_applicable`, because the `legacy-without-V3 recovery shape is absent`. |

No provider call, health probe, fabricated runtime/app-server readback,
generated checkpoint, or approval was used. The test deliberately owns only
the native adapter invocation; `codex-pretool-guard.test.mjs` was read-only.

## Boundary finding

The bootstrap-binding staging authoring admission is earlier than plan
approval. This run never reaches it: the sanctioned source/apply route cannot
establish the fresh V3 authority shape, and the lifecycle inspection requires
runtime/app-server observation before it observes continuity or an intake
checkpoint. Therefore this evidence makes no claim that staging authoring is
accepted, nor that later sanctioned progression is reachable.

The only already-known successful fixture route is test-only and supplies a
synthetic runtime readback through injected dependencies. That would
counterfeit the readiness condition for this end-to-end native subprocess
test, so it was not reused.

## CHAIN-2 correction

The CHAIN-1 conclusion that a sanctioned fresh-V3 producer was missing was
incorrect. Its fixture called the generic hook `fixture()`, which creates an
empty `.claude/` directory, then it initialized Git and wrote a README before
onboarding. `legacyInspection()` calls a root fresh only when it has zero
entries, so CHAIN-1 never exercised a fresh root.

CHAIN-2 uses an empty `mkdtemp` root, follows `plan`'s returned
`apply-portable-seed` action, and lets that action initialize Git. It uses the
real portable/runtime/intake producers and creates the checkpoint through the
consent-with-capture, design-answer, and generate plan/apply APIs. It does not
write a checkpoint or readiness receipt. The one disclosed fixture boundary is
the existing `issueLaunchTicket`/`consumeRuntimeReadback` observation seam:
the real CLI created the barrier and the seam verifies its ticket, repository
fingerprint, and generated target digests before clearing it. No Codex
app-server/provider call or live-user readiness claim is made.

With that boundary, the real native Codex PreToolUse adapter allows the
multi-file patch containing an absolute generated PRD path, a relative
generated spec path, and `scratch/greenfield-boundary.md`. Its empty successful
stdout is the adapter's allow contract. The subsequent inspection remains
`bootstrap-binding-required`, which is earlier than plan approval; no PO
acknowledgement or binding approval was fabricated.

The CHAIN-2 generic `scratch/linked/escape.md` negative is retained as failed
fixture history only. It used a nongoverned fixture and an internal alias, so
it did not establish a Greenfield lifecycle defect.

The subsequent containment dispatch retained the zero-entry producer and
generated checkpoint, then reproduced the actual defect through the native
Codex adapter: lexical `scratch/` aliases to the generated root's `src/` and
`.claude/` paths were allowed while the inspection remained
`bootstrap-binding-required`, before plan approval. The external-sibling alias
was already denied by existing project containment. The red capture is
`scratch/NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1/generated-native-scratch-alias-red.txt`.

The lifecycle repair now anchors the intended scratch admission at the
physical scratch root using a scratch-scoped lstat-aware nearest-existing-entry
realpath walk. It rejects a symlinked scratch root, descendant aliases leaving
scratch, and dangling leaf aliases, while retaining legitimate first creation
and physically contained descendants. The generated native positive keeps its absolute PRD, relative
spec, and nested scratch target. The combined direct suites pass in
`scratch/NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1/guard-lifecycle-and-native-green.txt`.
The scratch predicate treats only `ENOENT` as a missing entry for first
creation; injected `EACCES` and `EIO` failures at both the scratch root and a
candidate ancestor deny, so an unreadable or faulty filesystem is never
misreported as an absent scratch directory.

The final combined green capture reports 247 lifecycle `node:test` cases and
a separate 16-check `guard-apply-patch` script. A preceding 2026-09-08 rerun
of the genuine native positive instead received native JSON deny
`GUARD-LIFECYCLE-NOT-READY` with lifecycle status
`session-capability-unavailable`. That exit-1 capture used the same path and
was overwritten by the single succeeding green retry; no separate timestamp or
failing artifact remains. It is a material transient observation, not a claim
that concurrent capability probing is stable.
The only simulated boundary remains the documented host runtime-readback seam;
the checkpoint, native adapter probes, and lifecycle decisions are real local
composition. This is not a live user-session readiness claim and does not
fabricate PO plan approval.

The first rerun after the lstat error-class correction reported
`session-capability-unavailable` in the genuine native positive; the next run
passed. The worker reused the capture path and overwrote that failed artifact.
Its exact diagnostic is therefore not durably available here. This is an open
stability concern for candidate verification, not evidence that one retry
resolved the cause. The successful combined capture contains 247 lifecycle
test cases plus the standalone 16-check apply-patch script (248 Node test cases).
