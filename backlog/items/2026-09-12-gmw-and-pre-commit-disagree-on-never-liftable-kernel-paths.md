---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-precommit-kernel-precedence-diverges
type: defect
owner: pipeline
status: in_progress
created: 2026-09-12
sprint: nova-b
done_when: manual
source: "Observed while integrating the Nova B TP-4 hook registration under a signed GMW."
---

# GMW and pre-commit disagree on never-liftable kernel paths

## Problem

`guard-testpath.mjs` accepts a matching TP maintenance window before checking
whether the target is in `NEVER_LIFTABLE_KERNEL_PATHS`. The installed
pre-commit hook does not recognize maintenance windows at all. During the
signed TP-4 integration this made PreToolUse admit `hooks/hooks.json`, while
pre-commit correctly refused the same staged change. Four imports added by
already-landed Nova B packages also leave the kernel-closure invariant red.

## Done when

- PreToolUse and the installed pre-commit hook check never-liftable kernel
  membership before accepting a matching signed maintenance window.
- A real signed-window test proves that ordinary matching TP paths remain
  liftable, wrong-scope windows remain refused, and `hooks/hooks.json` remains
  refused even under a matching TP-4 window.
- The four unique transitive dependencies reported by GMWKC01 are recorded in
  ADR-0058, the threat model, and `NEVER_LIFTABLE_KERNEL_PATHS`.
- The generated pre-commit hook's dynamic import is covered by the kernel
  closure declaration, and all focused suites pass.
- Normal onboarding upgrades a previously managed installer-v1 hook to the v2
  implementation, while the existing foreign-hook refusal remains unchanged.

## Scope

No rule becomes newly liftable, no window scope grows, and no bypass is added.
The attended external author-repair route remains required for kernel files.

## Rollback

Revert the integration commit. The next ordinary onboarding apply then renders
the prior managed hook implementation from the reverted installer. A repository
that cannot wait for onboarding can run that reverted installer's documented
`--install` command directly. Foreign hooks remain untouched in both directions.
