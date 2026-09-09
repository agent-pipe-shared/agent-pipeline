# Native current-artifact review evidence

Task: `NVA-NATIVE-CURRENT-ARTIFACT-REVIEW-1`

The native Critic now accepts one closed alternative to an exact range:
`reviewScope: { kind: "current-artifacts", paths: [...] }`, with no
`reviewBase`. The selection request digest binds the full mode, candidate,
ordered reference-set digest, and scope. Scoped sources bind Git blob, bytes,
and regular-file mode; the execution receipt returns the scope and its source
coverage.

Focused checks on 2026-09-10:

- `node --test plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs` — 11 passing.
- `node --test plugins/pipeline-core/lib/sandboxed-readonly-duty.test.mjs` — 15 passing.
- `node plugins/pipeline-core/scripts/codex-critic-host.test.mjs` — 124 passing.
- `node --test plugins/pipeline-core/scripts/codex-sandbox-runtime.test.mjs` — 15 passing.

The real-Git host fixture covers an artifact unchanged across a later candidate
commit, physical byte and executable-mode drift before dispatch, and drift
after child completion. These are adapter tests only; no live model review or
full Verify was run in this task.
