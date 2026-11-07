# w255: an Antigravity-hosted Elephant dispatches native Goldfish subagents (candidate 20, G20-8 B and G20-22)

Base: `a3e14b6382997283a1fb0daea99763d7cab4bcaa` (candidate-20 chain). Built in the slice clone `scratch/agent-out/s-agy` by the pipeline
Goldfish `C20-G208B-AGY-NATIVE` (AC-108, existing criterion, unchanged text). Held for candidate 20; no apply script. Not committed in the real
repository (host commit). Status: **checkpoint, not complete**: see "Remaining".

## What is built (all on measured facts, `w252-agy-native-subagent-measurement.md`)

- **`lib/agy-native-goldfish.mjs` (new).** The flat-args decode (`decodeNativeInvokeArgs`, one level of JSON string encoding), the child
  binding (`bindNativeChild`: brain root = parent directory of `artifactDirectoryPath`, exactly one `<brain>/<parent>/.system_generated/
  subagents/<child>.json` naming the payload's `conversationId`; zero = not a child, more than one = ambiguous and refused), the resolved-model
  check (`evaluateNativeChildCall`: the child's `modelName` against the registry's Antigravity cell for the role's duty, never the alias; typed
  `AGY-NATIVE-CHILD-MODEL-MISMATCH` naming both values and the repair), the serialization rule (`evaluateNativeGoldfishParentCall`) and the
  brain/config write refusal (`nativeBrainWriteRefusal`, `AGY-NATIVE-BRAIN-WRITE`).
- **The one switch:** `AGY_NATIVE_SERIALIZE_CODE_WRITERS` (`true`). It carries three refusals together: `Workspace` other than absent/`inherit`
  (`AGY-NATIVE-WORKSPACE-UNMEASURED`), more than one entry or code writer per call (`AGY-NATIVE-CODE-WRITER-ONE-PER-CALL`), a second code writer
  while a descriptor of the session is `SUBAGENT_STATE_ALIVE` (`AGY-NATIVE-CODE-WRITER-ALIVE`, repair: wait for the first child's message).
  Read-only roles are never counted or limited. M4b lifts it by setting the constant to `false`.
- **`hooks/antigravity-pretool-guard.mjs`.** The consent branch (`AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE`) is gone for goldfish-implementor,
  -mechanic and -deep: the call goes through the same `guard-dispatch` admission as a Claude `Agent` call (generated briefing, selected model via
  `evaluateDispatchModel`, write-capable carrier), then the serialization rule. Every hook call of a native child is bound and model-checked
  before anything else; the child's tool calls are then governed by the unchanged guards (M2/M7/M9). The prepared one-shot artifact
  (`verifyAntigravityNativeDispatch`) is no longer demanded for the three code-writing roles (decision below).
- **`hooks/guard-dispatch.mjs`.** `antigravity` joins `direct` and `codex` as a transport the governed item queue accepts (one word;
  `prepareGovernedItemQueue` takes no transport). Without it a generated v3 briefing from Antigravity hit `SQ-NATIVE-ITEM-ADMISSION-REQUIRED`.
- **References.** `antigravity-native-dispatch.md` describes the measured flat shape, the binding, the model rule, the serialization, the
  in-turn delivery (the old "end the parent turn, the message stayed undelivered" text is corrected), and the host-commit route.
  `happy-path.md` and `config/runner-capabilities.json` carry the same one-row change (they are checked against each other).
- **Pin (RED first, then green):** `lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs`, five cases
  replaying the measured payloads. RED against the original code: 5 of 5 failed (`exit 1`), green after the change: 5 of 5 (`exit 0`).

## Decisions taken inside the briefing (judgment, please confirm)

1. **No prepare step for the three code-writing roles.** The briefing says "exactly like a Claude Elephant dispatches through the Agent tool";
   the Claude route has no one-shot artifact, and the artifact's packets (required input digests, `resultDestination: return`) were designed
   for read-only reviews. The generated-briefing admission in `guard-dispatch` is the gate. Read-only roles keep the prepare step.
2. **The model check covers the goldfish roles only.** A Critic child resolved on this host would mismatch the registry's `pro` selector
   (flash and pro resolve to the same model), and refusing it would break the read-only flow that works today.
3. **The expected model is the registry's Antigravity cell selector** (`config/runner-profiles-v3.json`, `duty.implement|mechanic|deep`),
   compared after lower-casing and mapping every non-alphanumeric run to `-`. The registry's cells for Antigravity stay `unavailable`
   (not changed: it is digest-pinned registry state and not needed, because the dispatch model rule reads `nativeTier`).
4. **Unreadable route source = no opinion** (the existing rule of `dispatch-model-enforcement.mjs`), so a broken configuration cannot leave a
   dispatch nobody can repair.

## Still unmeasured, for the PO (numbered M-items; each is one probe in a real agy session)

- **M4b** (existing): `Workspace: branch` / `share` in a GIT workspace: real isolated checkout? which base commit? how do results return?
  Until then code writers are serialized (the switch above).
- **M10: the spelling of `modelName`.** Dispatch one child with `Model: flash` and one with `Model: pro` and record the child payloads'
  `modelName` verbatim. If the host reports a display name (not `gemini-3.8-flash-high` after normalization), every goldfish child is refused with
  `AGY-NATIVE-CHILD-MODEL-MISMATCH`; the repair is the registry cell value or one normalizer line in `lib/agy-native-goldfish.mjs`.
  Also decides whether any alias reaches `duty.deep` (`gemini-3.1-pro-high`): flash and pro were the same model on the measured build.
- **M11: descriptor `state` values.** Only `SUBAGENT_STATE_ALIVE` was seen. Record the state of a child that finished, was killed
  (`manage_subagents kill`) and failed. The guard counts exactly `SUBAGENT_STATE_ALIVE` as alive.
- **M12: descriptor timing.** Is the descriptor on disk before the child's FIRST hook call? If not, that first call is unbound and, by design
  (`not-a-child`), unchecked. Measure by logging the first child hook event against the descriptor file's creation time.
- **M13: parent payload.** Confirm for a PARENT hook call that `artifactDirectoryPath` is `<brain root>/<conversationId>` (the guard derives the
  brain root as its parent directory and reads the parent's own `subagents/` directory for the alive count).
- **M14: host commit trigger.** Does an Antigravity child's end (Stop hook or completion message) fire any plugin hook? Not measured. Until it
  is, run the existing agent-run `scripts/goldfish-host-commit-recover.mjs` plan/apply after the child reported. No Antigravity-only mechanism.
- **M15: briefing round trip.** Dispatch one real generated briefing (`dispatch-briefing.mjs build --runner antigravity`) for each of the three
  roles end to end; the fixtures here stop at `guard-dispatch`'s own judgement.
- **M16: Bash writes into the brain.** `AGY-NATIVE-BRAIN-WRITE` refuses Edit/Write targets and Bash commands that name the brain/config paths
  and are not a plain read; a shell that builds the path indirectly is not seen. Measure what the lifecycle guard says to such a write.

## Deliberately not changed

- `lib/path-spelling.mjs` and the separator-sweep sites (briefing). `lib/agy-native-implementation-admission.mjs` and its suite stay as they are
  (consent module kept for routes that still need it; the adapter no longer calls it).
- `config/runner-profiles-v3.json` (mechanic and deep stay `unavailable` there: registry state, signed digests).
- `hooks/hooks.json`, `harness/verify-suites.json` (protected). The new pin needs **registration in the Verify suite list** by the coordinator.

## Verification state at the checkpoint (clone head `3053e57c5`, one suite at a time, `TMPDIR` private)

- New pin: 5/5 (RED before the change: 5 of 5 failed, exit 1). `agy-driver-dispatch-and-design-routes-incomplete.test.mjs` 21/21 (case 17 restated
  in place, QG-04: the route table row and the end-of-turn sentence are what the measurement contradicted; the legacy-route assertions are unchanged).
  `dispatch-model-enforcement.test.mjs` 12/12. `runner-capabilities.test.mjs` 5/5 (happy-path row and capability row edited together).
  `agy-native-implementation-admission.test.mjs` 13/13 (module untouched). `antigravity-native-dispatch-coordinator.test.mjs` 25/25.
  `antigravity-native-dispatch-pretool.test.mjs` 11/11.
- `antigravity-pretool-guard.test.mjs` (13 minutes, custom `check` runner): 40 of 41 ok, including the two restated native-implementation cases
  (they now assert the call is still refused, by the generated-briefing admission, and that no refusal names the consent route). The 41st,
  `Antigravity start hint never creates .git before Git initialization`, failed; it exercises `hooks/antigravity-start-hint.mjs` which this patch
  does not touch (see the dispatch report for whether a re-run isolated it).
- `hooks/guard-dispatch.test.mjs` was **not run** (budget). Its change is the one word `antigravity` in the governed-item transport list.

## Remaining (continuation)

1. Run `hooks/guard-dispatch.test.mjs` and `hooks/guard-dispatch-fanout.test.mjs` alone against the clone head.
2. Decide the failing start-hint case (baseline run of the same suite on `a3e14b638`).
3. Register the new pin in the Verify suite list (protected `harness/verify-suites.json`; coordinator).
4. Run M10 to M16 above in a real session; M10 decides whether `AGY-NATIVE-CHILD-MODEL-MISMATCH` ever fires on a correct dispatch.
