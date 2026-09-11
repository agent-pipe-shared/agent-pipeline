# Advisory dispatch preflight — Critic PASS

Date: 2026-09-11

The runner-neutral dispatch preflight is now consumed by the real Advisory
host bridge before any Claude, Antigravity or Codex advisory launcher. The
implementation was developed as four local commits:

- `856cd351` wires the common packet into the host bridge;
- `c6681cfb` binds the checked repository root to the Codex launch, validates
  the complete evidence bundle and rejects symlinked result directories;
- `aa9507f5` rejects dirty required source paths against the candidate;
- `36a5329d` binds each transported SHA-256 directly to the immutable
  candidate blob, closing the remaining check/use race.

Focused evidence:

- dispatch-policy checks: 23/23 passed;
- advisory-host-bridge tests: 17/17 passed;
- codex-advisory-bootstrap tests: 6/6 passed;
- invalid paths, dirty candidate files, candidate-foreign bundle bytes,
  evidence digest/reference drift and symlinked receipt roots all report zero
  model and launcher calls.

Fresh Critic-mode Verify ran with reuse disabled against the final correction
commit `36a5329dc71e029970629db6afe94609bfd9d4ae`, tree
`2d4c197b3c1106402fd006f56d57a00d2c24e447`. All 520 registered suites
passed in run `verify-1789121597687-abc785abf707da12`.

The independent correction Critic returned PASS with no findings. It
confirmed that the outbound bundle itself, rather than a later unrelated
filesystem read, is bound to the frozen candidate blob.

This evidence completes the Advisory coordinator slice. The parent backlog
item remains open until the other shipped model-launching coordinators consume
the same common preflight.
