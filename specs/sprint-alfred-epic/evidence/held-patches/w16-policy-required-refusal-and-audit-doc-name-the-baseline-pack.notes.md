# Held patch notes — the policy-required refusal and the audit doc name the shipped baseline pack (candidate 15c, follows D229)

Patch: `w16-policy-required-refusal-and-audit-doc-name-the-baseline-pack.patch` (apply AFTER `w10-core-policy-pack-for-the-feature-close-audit`).

## Why

The w10 notes listed two follow-ups: the `FCA-POLICY-REQUIRED` remedy still read "do not invent a policy" without naming the route that D229 shipped, and
`docs/audit-and-evidence.md` still said the bundle plan "needs an approved organization policy pack". A consumer that hits the refusal had to read code to
learn that `"packs":["pipeline-core-baseline"]` is accepted.

## What

- `plugins/pipeline-core/lib/feature-close-audit-preflight.mjs`: the remedy keeps its original sentence and appends the route
  (`"packs":["pipeline-core-baseline"]`, `docs/organization-policy-packs.md`).
- `plugins/pipeline-core/lib/feature-close-audit-preflight.test.mjs`: the missing-policy case also asserts the route is named (+1 assertion).
- `docs/audit-and-evidence.md`: the sentence now says a policy pack is needed: an approved organization pack, or the shipped core baseline pack named by id, with a link
  to the organization policy packs page.

No behavior change: same code, same blocking outcome, same `requiresAdditionalApproval: false`.

## Evidence

Scratch clone: preflight and close-coordinator audit lifecycle suites 6/6 pass; documentation contracts valid. The 15c rehearsal re-runs the combined suites.
Pending: Full Verify, batch Critic, native runs, PO acceptance.
