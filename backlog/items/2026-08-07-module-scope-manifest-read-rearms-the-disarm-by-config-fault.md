---
schema: pipeline.backlog-item.v1
id: pipeline.module-scope-manifest-read-rearms-the-disarm-by-config-fault
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Observed out-of-diff by the PHX-R1-REWORK-3 Critic (round 4) while deriving the shell lane's governance-marker list from source, offered without severity because it is not a defect of that review object. Independently re-verified from source by the Elephant before filing."
due: 2026-09-06
---

# Both admission hooks re-arm the disarm-by-config-fault that the library documents having fixed

## Description

`plugins/pipeline-core/lib/runtime-projection-v3.mjs` carries a 20-line comment
(`:99-118`) explaining a fixed defect in its own words:

> Reading and freezing it at module scope meant a missing, unreadable, or
> malformed `config/runtime-projection-v3-owned-keys.json` threw out of this
> module's top-level scope — so merely IMPORTING this file crashed, before any
> function in any importer could run. The fail-closed admission hooks
> (`hooks/guard-lifecycle-ready.mjs`, `hooks/codex-pretool-guard.mjs`) import it,
> and an ES-module-evaluation throw kills them before `main()` exists: node exits
> 1, which `hooks/hooks.json` defines as "allow + config warning". **A config
> fault therefore DISARMED a deliberately fail-closed gate.**

The fix deferred the read into the memoized `frozenOwnedKeys()` (`:119-125`).

**The two hooks named in that comment now do the same thing again**, through the
*other*, unmemoized and unguarded export `loadRuntimeProjectionV3OwnedKeys()`
(`:129-131`, a bare `readFileSync` + `JSON.parse` with no try):

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:43` — inside the
  module-scope `GOVERNANCE_MARKERS` array literal (`:36-44`).
- `plugins/pipeline-core/hooks/codex-pretool-guard.mjs:200` — inside the
  module-scope `lifecycleGoverned` array literal (`:193-201`).

A third module-scope call site exists in
`plugins/pipeline-core/lib/private-overlay-runtime-projection.mjs:25`; it is not
an admission hook, but it propagates the same throw to anything importing it at
module scope.

The exit semantics are not inferred — `hooks/hooks.json` states them in its own
`$comment`: *"Exit semantics of all PreToolUse guards: 0 allow, 2 block (stderr
to the agent), 1 allow + config warning (stderr to the user)."* An
ES-module-evaluation throw exits 1. **Allow.**

## Why this matters more than an ordinary robustness nit

1. **The failure direction is open, not closed.** Every other failure path in
   these hooks refuses. This one admits — and admits *silently* from the agent's
   point of view, because the warning goes to the user's stderr, not into the
   tool result the agent sees.
2. **It disarms both write and shell lanes at once.**
   `guard-lifecycle-ready.mjs` is wired to `Bash|PowerShell`
   (`hooks.json:16-24`) **and** to `Edit|Write|NotebookEdit` (`:25-33`). One
   unparseable shipped JSON file therefore opens both.
3. **The trigger is a shipped config file, not attacker input.** A truncated
   plugin install, an interrupted update, a bad merge of that JSON, or a stray
   editor write is enough. This repository has already had a plugin tree
   installed as a flat copy with no `.git`; integrity of the shipped tree is a
   known-soft assumption here.
4. **The regression is documented-fix-reverted, which is the expensive kind.**
   The knowledge exists, in the right file, in plain language. It did not reach
   the two files that most needed it, because nothing enforces it — the comment
   is prose next to the fixed call site, and the later additions used the other
   export. That is the same "knowledge in the wrong place" class as
   `backlog/items/2026-08-07-ruleset-source-test-unregistered-in-the-verify-gate.md`.

## Triggering situation

2026-08-07, PHX-R1-REWORK-3 Critic round 4. The reviewer read
`guard-lifecycle-ready.mjs:36-44` to derive the eleven shell-lane governance
markers, followed the loader, and found the comment describing the failure mode
the call it had just read reintroduces. Out of scope for that review object, so
reported without severity rather than as a finding.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:36-44`,
`plugins/pipeline-core/hooks/codex-pretool-guard.mjs:193-201`, and
`plugins/pipeline-core/lib/private-overlay-runtime-projection.mjs:25`, against
`plugins/pipeline-core/lib/runtime-projection-v3.mjs:99-131` and the exit
semantics recorded in `plugins/pipeline-core/hooks/hooks.json` (`$comment`).

## Proposal

**Owner: PO.** Guard-kernel code — needs its own briefed dispatch and an
independent review, not a drive-by edit.

1. **Move both hook reads off module scope.** The marker list is only needed
   where it is consulted (`guard-lifecycle-ready.mjs:896`;
   `codex-pretool-guard.mjs:201`). Computing it lazily puts the failure on a code
   path that already has a refusal, instead of on the module's evaluation.
2. **Decide the failure direction explicitly, and write it down.** A fail-closed
   gate whose own configuration is unreadable should almost certainly refuse
   (exit 2) rather than admit. That is a behaviour change and therefore a PO
   decision, not an implementation detail — but the current behaviour is the
   result of an accident, not of that decision being taken.
3. **Consider retiring the unguarded export.** `loadRuntimeProjectionV3OwnedKeys()`
   is the sharp edge: it looks like the memoized safe one, is one identifier away
   from it, and has 20+ call sites. Either it grows the same guard, or the two
   are renamed so that picking the wrong one is visible at the call site.
4. **A test would have caught this and does not exist.** A case that corrupts the
   shipped manifest in a fixture and asserts the hook does **not** exit 0 pins the
   whole class. Note the sequencing constraint that keeps recurring: the hook test
   files are TP-protected and any new suite must be registered in
   `harness/scripts/verify.mjs` in the same change, which is itself TP-3-protected
   — see
   `backlog/items/2026-08-07-ruleset-source-test-unregistered-in-the-verify-gate.md`.
   Under the standing one-approval rule this is one release, not three.

**Not verified and deliberately not claimed:** no proof-of-concept was run. Doing
so means feeding a malformed manifest to the live guard that is currently
protecting this session — the demonstration would disarm the thing being
demonstrated. The claim above rests on reading the four files and on the exit
semantics the wiring states about itself.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
