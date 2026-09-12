# Requirement-traceability review specification

Review the candidate implementation against these requirements:

1. A feature may opt in through an adjacent `<spec-basename>.requirements.json`
   file. A feature without that file retains the previous Critic-admission
   behavior.
2. The map is read from the frozen candidate tree and binds the exact Spec path,
   Spec byte digest, candidate commit, and candidate tree.
3. The input schema is closed and bounded. It accepts only `path-exists` and
   `file-contains-literal`; it rejects commands, prose predicates, unknown keys,
   unsafe paths, symlinks, non-regular files, oversized inputs, excessive
   criteria, invalid ids, and oversized literals.
4. Every declared criterion receives a typed `present` or `absent` result.
   Any absent criterion rejects Critic admission with
   `CDP-REQUIREMENT-ABSENT` and identifies the missing criterion ids.
5. The evaluator never executes map content and does not infer unstated or
   subjective requirements.
6. The normal Critic packet includes the accepted requirement map among its
   candidate-tree guardrails.
7. Tests cover independent present and absent results, stale Spec digest,
   unsafe or unsupported input, the absence-compatible path, and the Critic
   preflight rejection before packet readiness.
8. Documentation states the material limitation: artifact presence does not
   prove behavioral correctness.

Rollback is an ordinary revert of the candidate commits, followed by the
focused evaluator and Critic-preflight suites and the registered Verify gate.
