---
schema: pipeline.backlog-item.v1
id: pipeline.critic-diagnostic-evidence-producer-and-registrar-disagree-on-the-location
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
sprint: alfred
source: "PO relay of the consumer handover (glossover path, 2026-10-26, finding PF-78, installed build 0.7.0+claude.20261026181519.1bcce7a): after the CDR patch the signed push is still impossible because producer and registrar of the Critic diagnostic evidence demand different locations"
done_when: manual
---

# The Critic diagnostic evidence producer and the registrar demand different locations, so a signed push stays impossible

Follow-up to `pipeline.critic-diagnostic-evidence-has-no-sanctioned-route-into-the-feature-manifest` (CDR, applied in
`1bcce7add`). The consumer's production fix (`/cms`) stays broken until it can push.

## Evidence (consumer, observed after installing the CDR build)

- The producer writes only below `evidence/` at the project root and refuses any other output
  (`lib/critic-diagnostic-evidence.mjs` `newDiagnosticPath`: `path.startsWith("evidence/")` else `CDI-OUTPUT-PATH`).
- The new registration command accepts only files below `specs/<feature>/evidence/`
  (`lib/feature-package-registration.mjs` `addCriticDiagnosticEvidence`, `pathProblem`: `FPR-DIAG-PATH`), for the
  diagnostic and for every member it names (targeted log, full-verify evidence).
- The consumer produced the diagnostic (targeted check green), registration refused with `FPR-DIAG-PATH`; the other
  direction fails too (the producer refuses a `specs/` output).
- Moving the file is not possible: the diagnostic embeds its own path with a digest; rewriting it would be forgery
  and the consumer rightly did not do it.
- In the consumer `evidence/` is ignored by Git while registration needs tracked files.
- `check-critic-bound-verify.mjs` reads the final Verify evidence at the fixed `evidence/verify-latest.json`, so the
  full-verify member has the same split.

## Wanted

- The producer writes into `specs/<featureId>/evidence/` of the active feature (output path rule shared with the
  registrar, one helper), so the chain produce, register, admit works end to end.
- Decide the full-verify member: either the registrar accepts the fixed `evidence/verify-latest.json` form, or the
  member is optional and its absence does not block admission; name the choice in the repair text.
- A chain test over the whole route (produce, register, Critic admission) in a fixture whose `evidence/` is ignored
  by Git.
- Message of `CDI-OUTPUT-PATH` and `FPR-DIAG-PATH` names the other tool's location.

## Notes

Kernel paths (`critic-diagnostic-evidence`, `feature-package-registration`, producer CLI): held patch applied by the
PO as operator. The consumer's handover is `docs/pipeline-handover-07-critic-blocker.md` (section after version
`…181519`) and `docs/pipeline-feedback-06.md` (PF-76 addendum, PF-78) in its repository.
