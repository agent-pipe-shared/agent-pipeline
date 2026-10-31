---
schema: pipeline.backlog-item.v1
id: pipeline.candidate11-follow-ups
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-30
priority: P3
release: 0.7.1
sprint: alfred
source: "Open items named in the candidate 11 held-patch notes (N25, N26, N29, reinstall) and a consumer report"
done_when: manual
---

# Candidate 11 follow-ups

1. Reinstall after uninstall does not regenerate the Antigravity workspace wiring (`.agents/*` actions of the journal);
   no case pins what follows through the Antigravity activation step.
2. N25: the architecture-map currency check is not part of Verify (`harness/scripts/verify.mjs` is protected, TP-3);
   an unverifiable adopted map (scaffold without a concept) is refused only by the final guard, not early;
   `hooks/guard-push-architecture.test.mjs` pins only the header, not the named contract paths.
3. N26: the private approval store lives in `lib/critical-action-authorization.mjs`; a move to its own module is a
   pure relocation. The action-local chat ceremony still writes the tracked record and keeps the fold.
4. N29 coordinator: the bootstrap verb takes no `--root` (D1); the composed close stops at
   `CLOSE-QUALIFICATION-REQUIRED` (D2).
5. N27: `plugins/pipeline-core/lib/published-tag-push.test.mjs` is not a Verify phase yet (needs `harness/scripts/verify.mjs`,
   TP-3, and an inventory rebaseline of `reader-inputs/product-capability-inventory.json`); the predicate is covered
   through the registered guard-push, pre-push-hook-install and push-init suites meanwhile. The guard-push
   release-adapter carve-out of the published-tag pass has no dedicated case.
6. Toolbox consumer: the guard refuses a Glob on `project/` (the calibration directory); the install hint does not say
   that a hook refresh is required after install.
