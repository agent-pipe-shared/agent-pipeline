---
schema: pipeline.backlog-item.v1
id: pipeline.protected-guard-imports-unprotected-grammar-and-classifier
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO question 2026-10-21 during the K13 package cut, specs/sprint-alfred-epic/plans/full-verify-correction-plan-2026-10-20.md K13 measurement 1"
sprint: alfred
done_when: manual
---

# Protected guard sources import an unprotected command grammar and test-path classifier

## Description

`plugins/pipeline-core/protected-baseline.json` protects the guard hook sources
(`hooks/guard-lifecycle-ready.mjs` and its siblings) and `lib/guard/*.mjs`. Those protected
modules import `hooks/guard-command-grammar.mjs`, which decides which shell commands are admitted,
and `lib/protected-test-paths.mjs`, which takes part in deciding which test paths are protected.
Neither file is in the baseline; only the tests of `protected-test-paths` are.

So an agent can widen the admitted command grammar, or narrow the protected test-path set, with
an ordinary unsigned edit, although the hook that enforces both is signature-protected. The
protection holds for the entry file but not for the logic it delegates to.

Found while cutting the K13 packages: the readers had classified AC-102, AC-181, AC-197, AC-201
and AC-207 as Goldfish work because these two files are not in the baseline. Those packages were
held and are routed as signature drop-ins until this item is decided.

## Acceptance

- `hooks/guard-command-grammar.mjs` and `lib/protected-test-paths.mjs` are protected sources in
  `protected-baseline.json` (PO-signed baseline change).
- A pin edits each newly protected file as an agent and shows the refusal with its repair route.
- PO 2026-10-21: protect both files now, in 0.7.0. The audit of every other module a protected
  guard imports, and its check, is the 0.7.x item
  `backlog/items/2026-10-21-protected-file-set-audit-after-0-7-0.md`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
