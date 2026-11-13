fix(criterion): bind an item criterion of the approved Spec at its approved path

Glossover consumer finding K-25 (2026-11-13, dispatch blocker): the
feature id changed after the design, so the approved PRD and Spec stayed
in the earlier dated specs/ folder; 28e carries them there for the
package (lib/feature-package-topology.mjs). The first item dispatch was
then refused SDC-AUTHORITY-UNAVAILABLE / item-course-criterion-unbound:
the host parses the criterion with the ACTIVE feature id, and
parseAcceptedCriticCriterion demanded specs/<featureId>/ for every
binding. dispatch-briefing build and probe used the spec's folder name
as the feature id instead, so they reported ready for a dispatch the
host refused.

- lib/critic-accepted-contract.mjs: parseAcceptedCriticCriterion admits
  a prd or spec binding under any canonical specs/<folder>/ path (the
  callers hand in only approved bindings: plan approval sourceRefs or
  the signed envelope's request binding); a companion outside
  specs/<featureId>/ and a locator that names no binding stay
  CAC-CRITERION-BINDING; the path grammar is unchanged.
  readAcceptedCriticCriterion (the Critic route) applies the same rule
  to the signed binding the locator names.
- scripts/dispatch-briefing.mjs: the criterion check passes the active
  feature id from the project state, like the host; the folder name is
  only the fallback when no state names an active feature.

Test: consumer-spec-criterion pin, case F (K-25): a Spec in the earlier
folder binds under another active feature id, with and without a PRD
binding; the same-folder case is unchanged; a companion there, a
locator with another digest, a traversal and a path outside specs/ are
refused.

Checkpoint-Intent: candidate 29, Glossover K-25
AI-Assisted: true
Dispatch: stage-0 (elephant)
