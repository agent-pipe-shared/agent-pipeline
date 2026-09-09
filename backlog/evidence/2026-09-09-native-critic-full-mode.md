# Native Critic full-mode evidence

`NVA-NATIVE-FULL-MODE-1` closes the native host-to-child review-mode field to
`full`. The host rejects a missing or unsupported value before child spawn;
the native child accepts that field only on its native request shape and tells
the model to inspect the supplied base-to-candidate correction range fully.
No prior receipt, verdict prose, finding, or delta metadata enters the child
request or prompt.

Focused checks passed: `node --test plugins/pipeline-core/lib/sandboxed-readonly-duty.test.mjs`
(12/12) and `node plugins/pipeline-core/scripts/codex-critic-host.test.mjs`
(123/123). These are fixture tests only; no live native Critic or provider run
is claimed.
