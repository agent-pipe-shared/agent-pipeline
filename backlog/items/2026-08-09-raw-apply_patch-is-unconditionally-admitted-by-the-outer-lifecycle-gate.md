---
schema: pipeline.backlog-item.v1
id: pipeline.raw-apply_patch-is-unconditionally-admitted-by-the-outer-lifecycle-gate
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "GF-078 (goldfish-deep), while fixing plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs's isRestartResumeHintInputWrite for Codex's apply_patch tool, 2026-08-09. The narrow fix landed (commit 92c4ee71) and is correct; this item documents a broader, adjacent reachability question the same investigation surfaced."
due: 2026-08-23
---

# `evaluateLifecycleReadyGuard`'s outer tool-name gate does not recognize `apply_patch` either, so a raw call bypasses lifecycle enforcement entirely

## What happened

While empirically reproducing the bug that motivated GF-078 (Codex's
`apply_patch` write to the resume-hint input file being refused during
`restart-required`), the dispatch found it could not reproduce the failure
end-to-end against `evaluateLifecycleReadyGuard` as originally briefed. The
reason: the OUTER tool-name gate in that function —
`if (![...SHELL_TOOLS, ...WRITE_TOOLS].includes(toolName)) return verdict(0);`
— does not recognize `"apply_patch"` as a tool name either. A *raw*
`apply_patch` tool call is therefore **unconditionally admitted at the very
top** of the guard, before ever reaching any of the lifecycle-readiness,
write-target, or resume-hint logic underneath it.

Separately, production wiring (`guard-apply-patch.mjs`) already translates
every real `apply_patch` invocation into a synthesized
`{tool_name: "Edit", tool_input: {file_path}}` call, per touched path,
*before* handing it to `guard-lifecycle-ready.mjs` — and that translated
shape IS correctly gated today, restart-required or not.

So in the currently-wired production path, this is believed to be
harmless (every real `apply_patch` call is translated before it reaches
the outer gate this item is about). But the outer gate itself provides no
defense in depth: if `apply_patch` ever reaches `evaluateLifecycleReadyGuard`
directly (a different call site, a future refactor of `guard-apply-patch.mjs`
that stops translating, a different runner's own hook wiring), it passes
through completely unenforced — no lifecycle check, no write-target check,
nothing.

## Why this needs a decision, not a quick patch

Two options, with different risk shapes:

1. **Leave it as-is** (rely entirely on `guard-apply-patch.mjs`'s
   translation as the sole enforcement point for `apply_patch`). Simpler,
   but means `guard-lifecycle-ready.mjs` has an implicit, undocumented
   dependency on a SEPARATE file always intercepting `apply_patch` first —
   if that assumption is ever violated, there is no second line of defense.
2. **Teach the outer gate to also recognize `apply_patch`** for defense in
   depth. This is NOT a narrow, obviously-safe change like GF-078's fix
   (which only widened one already-narrow function's own internal
   admission): the outer gate feeds many other downstream checks
   (`isForbiddenCrossRepositoryMutation`, `isReadOnlyDiagnosticCommand`,
   etc.) that were all designed and tested against Claude's `tool_name`
   vocabulary (`Bash`, `Edit`, `Write`, `NotebookEdit`) — widening what
   reaches them needs its own dedicated audit, not a one-line addition.

## Direction

PO/Elephant decision needed: confirm whether `guard-apply-patch.mjs`'s
translate-before-forwarding is meant to be the PERMANENT, sole enforcement
boundary for `apply_patch` (in which case, document that explicitly as an
architectural invariant, ideally with a test that would fail if a future
change let a raw `apply_patch` reach `guard-lifecycle-ready.mjs` untranslated),
or whether the outer gate should also learn to recognize it directly — which
would need a proper dedicated audit of every downstream check it feeds, not
a quick patch riding on an unrelated dispatch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
