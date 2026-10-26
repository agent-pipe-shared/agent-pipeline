---
schema: pipeline.backlog-item.v1
id: pipeline.critic-diagnostic-evidence-has-no-sanctioned-route-into-the-feature-manifest
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P0
release: 0.7.0
source: "PO relay of a consumer handover (Critic blocker on the signed-push path), 2026-10-26; the consumer's anonymised handover note is not in this repository"
done_when: manual
---

# The Critic cannot start: its diagnostic evidence has no sanctioned route into the feature manifest (CCA-DETERMINISTIC-UNAVAILABLE)

Interim-candidate priority (D165), same consumer push path as `pipeline.consumer-push-blocked-by-late-review-unit`
(PF-75). That item covers the review RANGE; this one covers the evidence ENTRY.

## Chain (as reported, verified in code)

1. The signed push is refused because it needs Critic evidence (`critic-bound-verify`).
2. The Critic cannot be started: `critic-dispatch-preflight.mjs` refuses with `CCA-DETERMINISTIC-UNAVAILABLE`.
3. The refusal comes from `deterministic()` in `plugins/pipeline-core/lib/critic-course-admission.mjs` (~line 482):
   it walks the artifacts of `specs/<feature>/lifecycle.json` registered as `class: candidate-evidence`
   (`authority: false`, `mutability: immutable`, `retention: retain`, path under `specs/<feature>/evidence/`),
   keeps those whose JSON is a `pipeline.critic-diagnostic-evidence.v1` bound to the candidate commit and tree, and
   raises `unavailable('CCA-DETERMINISTIC-UNAVAILABLE')` when none is registered.
4. A producer exists: `scripts/critic-diagnostic-evidence.mjs` (`--root --spec --log --out ... -- COMMAND`) writes the
   evidence JSON. No tool registers it in the manifest. `register-feature-package.mjs` accepts only `--root` and
   `--add-review-unit`. The only code that appends such a manifest entry is test fixtures
   (`critic-dispatch-preflight.test.mjs` lines 203 and 948). `skills/critic-review/SKILL.md`, `docs/push-release-flow.md`
   and `docs/operating-tools.md` do not describe the step.
5. Editing `lifecycle.json` by hand would bypass the sanctioned route (EL-37), so the consumer stopped, correctly.

## Wanted (any one is acceptable; the first is preferred)

- A: a sanctioned command that registers a produced diagnostic into the feature manifest (immutable
  `candidate-evidence` entry with the right shape, one commit, refusing a candidate or tree mismatch), plus the
  documented step in the Critic route (`skills/critic-review`, `docs/push-release-flow.md`).
- B: the preflight (or `critic-diagnostic-evidence.mjs --register`) performs the registration as part of producing
  the evidence.
- C (minimum): the refusal text of `CCA-DETERMINISTIC-UNAVAILABLE` carries the exact repair step and the `repair-map`
  names the route.

## Acceptance

- A feature without a registered diagnostic reaches a Critic start through the documented command alone, no manual
  manifest edit.
- The Critic can also review code delivered before the review unit existed (shared with PF-75 slices A and B).
- A diagnostic bound to another candidate commit or tree is refused at registration, not only at the preflight.
- Regression cases for the registration command and for the refusal text.

## Side findings from the consumer note

Four smaller findings on the same path were reported in the consumer's note; the PO is asked to relay that section,
because the note lives in the consumer repository (read-only for this repository).
