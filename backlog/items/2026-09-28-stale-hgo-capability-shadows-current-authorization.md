---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-stale-capability-shadows-current-authorization
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Actual ordinary signed wiring patch refused after genuine replacement authorization; old authenticated drifted capability enumerated before current matching capability."
sprint: none
done_when: manual
---

# Authenticated stale HGO capability hides a valid current authorization

## Confirmed behavior

Two exact ordinary guarded actions were separately signed and armed. Applying
the first changed the repository status observation bound by the second. That
initial `HGO-DRIFT` refusal is expected. A replacement authorization for the
same second action was then genuinely verified and armed against the current
repository observation, but its immediate ordinary application was refused
again: an older, unexpired, authenticated matching capability sorted first.

`consumeHumanGuardOverride` sorts capability filenames, verifies the matched
capability and its authorization audit, recomputes every binding, then returns
`HGO-DRIFT` immediately at `human-guard-override.mjs:4187`. This prevents the
later current capability from being examined. The expired branch already
continues enumeration. No authority or signature is missing in this case.

Actual audit sequence: 1156 authorized the replacement; 1158 rejected only
the old capability; 1159 recorded the ordinary refusal. After the old expiry,
the same ordinary retry succeeded at 06:53:33.717 UTC: 1161 expired the old
capability and 1162 consumed the replacement. No additional signature,
private deletion, alternate guard route, or weakened repository binding was
used. Root application evidence:
`scratch/readiness-repair-application-914270f1.md`.

## Correction and acceptance

- Audit and refuse each authenticated drifted match, release its lock, and
  continue looking for an independently authorized current exact match.
- Recompute and enforce all existing tool/input/denial/root/plugin/policy/
  repository/eligible-path bindings for each considered candidate.
- If no current candidate exists, retain typed `HGO-DRIFT`; retain
  `HGO-EXPIRED` for expired-only candidates. Define mixed stale/expired
  precedence explicitly. Never consume a drifted record.
- Encountered corrupt or unauthorized audit remains a global `HGO-AUDIT`
  failure, rather than being skipped to obtain a later authorization.
- Regression: two authentic matching records, old lexically first and still
  unexpired, real worktree drift between authorizations; only the current
  record consumes, old rejection remains auditable, locks close. Also test
  stale-only refusal and corrupt-audit refusal with a later current record.
- Preserve current invalid-capability skip behavior and avoid selecting a
  candidate merely because it is newest or last in the directory.
- Close manually only after source integration and committed verification.

## Duplicate check and adjacent workflow improvement

Existing 2026-08-18 author-repair item added per-check drift diagnostics and
explicitly made no control-flow change. Existing Finding6 tests concern
unvalidatable records or different tool inputs. The 2026-08-28 expired-arming
item, proof-file-overwrite item, and closed 2026-08-30 concurrent-commit
advisory do not cover this authenticated, unexpired, matching-record search
failure. The HEAD did not need to change for the real status drift.

Separately, extend existing `2026-09-27-hgo-patch-preflight-before-signature.md`
or its orchestration instructions to prepare dependent one-action ceremonies
sequentially: arm/apply/read back A, then prepare B against A's actual result.
Repository status binding remains strict. A grouped admitted transaction is
a separate future protocol design and is not required for this search fix.

## Prepared evidence

Scratch-only two-surface source/regression proposal:
`scratch/hgo-stale-capability-shadowing-914270f1/manifest.json` and
`source.patch`. Tests are controlled attended chat fixtures using actual
capability authentication and audit APIs; the real replacement signature
verification and successful expiry recovery are root execution evidence.
No productive source, installed guard, or live capability was changed by
this preparation. Targeted proposal test evidence will be recorded separately;
this item does not claim productive integration or a release readiness PASS.
