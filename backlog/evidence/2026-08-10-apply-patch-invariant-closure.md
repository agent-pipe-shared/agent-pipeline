# Closure evidence: `apply_patch` translate-first architectural invariant

- **Item:** `2026-08-09-raw-apply_patch-is-unconditionally-admitted-by-the-outer-lifecycle-gate.md`
- **Decision:** option 1 from the item's own "Why this needs a decision"
  section — document as a permanent invariant, with regression coverage —
  chosen by the PO, 2026-08-10. Option 2 (widen the outer gate for defense
  in depth) remains open for a future dedicated audit, not decided against.
- **Fix commit:** `7ceb8781a187310727c29b15a512bbce7e48a267` (GF-089,
  goldfish-deep) — adds an architectural-invariant comment to
  `plugins/pipeline-core/hooks/guard-apply-patch.mjs`'s per-path translation
  loop, and two regression tests to `guard-apply-patch.test.mjs`: (a) a
  direct call to `evaluateLifecycleReadyGuard` with a raw `apply_patch` tool
  call is admitted unconditionally (`exitCode: 0`) even against a governed
  path, contrasted against the identical path in translated `Edit` shape
  being correctly blocked; (b) a source-level pin asserting the translation
  loop always synthesizes `{tool_name: "Edit", tool_input: {file_path}}` and
  never forwards the original `tool_name`/`"apply_patch"` literally.
- **Independent verification (Elephant, this session):** `git show
  7ceb8781` reviewed directly. Confirmed via GF-089's own report that the
  investigation reconfirmed the invariant genuinely holds today (re-checked
  `guard-lifecycle-ready.mjs`'s outer gate directly, and
  `codex-pretool-guard.mjs`'s own separate `lifecycleShouldRun` gate, which
  deliberately excludes `apply_patch` from its own tool list) — this was not
  simply trusted from the earlier backlog item's prose. GF-089 additionally
  validated the new test is load-bearing by mutating a scratch-only copy of
  the guard to skip translation and confirming the new source-pin test then
  fails, before deleting the scratch mutation (never touched the tracked
  tree). `node plugins/pipeline-core/hooks/guard-apply-patch.test.mjs` →
  11/11 pass, exit 0. Full `node harness/scripts/verify.mjs` → 267/267
  suites, exit 0, bound to commit `7ceb8781`.
