# w99 (A18-M1B): the briefing generator knows the Antigravity runner and prints accepted aliases

Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.
Order: this patch is a delta on held patches w85 and w94. Apply w85, then w94, then this patch; it does not apply to a checkout without them.

## What

- `dispatch-briefing.mjs`: `RUNNERS` gains `antigravity`. The model id is checked against the native alias the V3 registry projects for the duty (`flash_lite`/`flash`/`pro`); the alias list is imported (`ANTIGRAVITY_NATIVE_MODELS`, now exported from `lib/dispatch-model-enforcement.mjs`, plus a new `antigravityNativeTierForTaskRoute`), never copied. The binding keeps the Claude shape with `runner: "antigravity"`; claude and codex output is untouched.
- `lib/agent-model-registry.mjs`: `acceptedFamilyForms` (prefixes of `MODEL_FAMILY_ALIASES` and one example id). `DBG-MODEL-FAMILY` now prints the accepted prefixes, an example, that a bare alias of another family belongs to a different agent type, and MP-29 (the tool-layer `model` parameter selects the model). A Gemini id is pointed to `--runner antigravity`.
- `references/antigravity-native-dispatch.md`: one note; the generated briefing is delivered as the packet Prompt of the prepare request. The Prepare guard does NOT yet require it.

## Moved assertion (QG-04)

The case "a Gemini model id is told that an Antigravity dispatch does not use this generator" kept its intent (a Gemini id is told where it belongs); the assertions on "does not use this generator" and `pipeline.role-dispatch-request.v1` moved to "a Gemini id belongs to an Antigravity dispatch" and `--runner antigravity`.

## Why

PO decision 2026-11-02, option 2 of A18-M1: every Gemini id failed `DBG-MODEL-FAMILY` on an Antigravity-hosted Elephant.

## Not changed

Prepare guard, native implementation admission, consent files, claude/codex briefing bytes, any existing refusal code. `dispatch-record-write.mjs` has no production change: the attested route already records an `antigravity` briefing (alias model) as `declared-unobserved`; a new case pins it (corpus count 44 to 45).

## Not proven / open

- Not proven: an Antigravity-hosted run end to end; the output is only checked against the registry.
- STOP finding for `build`/`probe`: `lib/dispatch-briefing-build.mjs` `verifyGeneratedBriefing` (about line 257/263) calls `parseNativeGoldfishBriefing`, whose runner check (`lib/native-goldfish-host-return.mjs` line 76) admits only claude and codex. The `binding` path works (self-check reads the runner as claude); `build --package` with `runner: antigravity` has NOT been run and likely fails verification until that host parser admits `antigravity`. Both files are outside this slice's scope.
- Not run: `dispatch-model-enforcement.test.mjs` (no new case there), `check-consumer-safe-paths.test.mjs`; no test for the exported alias list beyond the briefing case.
- The dispatch-briefing suite fails the single environment case `public --help ... HELP-FORBIDDEN-IO` in any checkout below the home directory.
