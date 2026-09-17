---
schema: pipeline.backlog-item.v1
id: pipeline.precommit-hook-refusal-diagnostics-are-not-observable-in-verify
type: defect
owner: pipeline
status: closed
done_when: manual
created: 2026-09-17
sprint: nova-b
closed_at: 2026-09-17
closure_repository: self
closure_commit: 1522567a0e69d4b720b9e052f7e8d33861e7ce99
closure_evidence: backlog/evidence/2026-09-17-precommit-hook-sandbox-reclassification.md
tracking: "Reclassified on 2026-09-17: restricted Codex sandbox child-process EPERM, not a pre-commit hook product defect. The existing Codex sandbox item is the single owner."
source: "Direct local reproduction on 2026-09-17: `node plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs` returned 41 pass / 10 fail; every failure was an empty expected diagnostic, while the positive sanctioned verify transition passed."
---

# The pre-commit hook's refusal diagnostics are not observable by its Verify suite

The real hook blocks each expected negative fixture: its process exit is
non-zero, so the safety boundary is not being reported as an allow.  Yet the
suite's ten negative end-to-end cases receive empty `stderr` from the spawned
Node/Git process and consequently fail their assertions for the required
operator-facing explanation.  The matching positive design-to-implementation
verify transaction passes.

This is not a claim that a hook may silently deny a commit.  A manual direct
invocation of the generated implementation emits the `BLOCKED` explanation,
but the registered suite's child-process arrangement cannot observe that
output on the current Node runtime.  The exact relay/root cause remains to be
measured; do not weaken diagnostic assertions or accept exit status alone.

## Reproduction

From this repository root, run the same file invocation that Verify's journal
uses for this suite:

```text
node plugins/pipeline-core/scripts/pre-commit-hook-install.test.mjs
```

The observed result is 41 passing and 10 failing cases.  Each failing case
first proves a non-zero refusal code, then fails only because the expected
`BLOCKED`, rule-id, or fail-closed diagnostic is empty.  `node --test` also
fails in this runtime, but reports only the enclosing-file failure; it is not
the registered Verify command and must not be substituted as a fix.

## Correction and closure

The apparent defect was re-measured before any hook change.  The failing child
process returned `error: EPERM` in the restricted Codex sandbox, so it never
started the generated hook.  The same suite passed 51/51 through the
authorized local Git/child-process boundary.  It is therefore a duplicate
intake for
`pipeline.codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn`,
not a release or pre-commit product defect.  The full measurement and
readback are in the closure evidence named above.

## Historical direction (not to implement from this item)

Find the actual process/stdio boundary that loses the child diagnostic, then
make the suite observe the real installed-hook output through a stable channel
without relaxing the assertion that a refusal is human-actionable.  Preserve
all existing positive and negative commit-boundary tests.  Receipt reuse must
not be used as evidence that this suite executes green on a new runtime.

## Historical acceptance criteria (superseded by the reclassification)

- The registered Verify invocation exits zero on a fresh execution, not merely
  a reused receipt.
- Every existing negative end-to-end case proves both rejection and its
  actionable refusal diagnostic.
- The sanctioned baseline-only-to-configured verify transition remains
  admitted without a second signature.
- A full local Verify records a freshly executed, passing receipt for this
  suite before it is presented as release evidence.
