---
schema: pipeline.backlog-item.v1
id: pipeline.phoenix-merge-re-critic-minor-findings
type: workflow-improvement
owner: pipeline
status: closed
created: 2026-08-27
closed_at: 2026-08-29
closure_repository: self
closure_commit: b774f74b724a18060d565a1f307fbb82eef5e6be
closure_evidence: plugins/pipeline-core/hooks/guard-push.test.mjs
sprint: nova
tracking: "Reassigned from phoenix to nova on 2026-08-28 by PO decision, after the Phoenix line was intaked into Nova"
source: "Re-Critic (delta) on the Phoenix-merge rework diff 290bd599..eeebeed5, PASS with three minor findings, 2026-08-27"
done_when: contains plugins/pipeline-core/hooks/guard-push.test.mjs PG12s16
---

# Three minor findings from the Phoenix-merge re-Critic, recorded rather than fixed in-cycle

## Description

The delta re-Critic over `290bd599`, `35481ba4`, `eeebeed5` returned **PASS** —
no blocker, no major. Three minor findings survived its evidence gate. They are
filed here rather than fixed inside the merge cycle: none blocks the candidate,
and each further change would restart the verify-and-review loop the PASS just
closed.

### F1 — a security-config comment claims broader closure than its check provides

`.gitleaks.toml` justifies exempting `transitions-phoenix-history.ndjson` by
saying `checkPhoenixHistoryImmutable` pins its bytes, "so no new content, secret
or otherwise, can reach this path without failing that check first".

The exemption regex matches **any** nested `.../backlog/transitions-phoenix-history.ndjson`;
the pin covers only the single top-level file (`PHOENIX_HISTORY_PATH` joined to
the repo root). A file at a nested `backlog/` segment is exempted from two
secret rules and pinned by nothing.

Notably the same file admits exactly this nested-path limitation ten lines
earlier, for the *anchoring* change — then makes an unqualified claim for the
*pin*. `backlog/README.md:105` repeats it without qualification. The defect is
the overstatement, not the exemption: a contract that overstates enforcement is
worse than none. Fix is a wording/scope correction in both places.

### F2 — `checkPhoenixHistoryImmutable` has no test and cannot be reached by any fixture

The integrity check F1's exemption leans on has zero coverage, and its own
docstring explains why: it is presence-gated, and every `check-backlog-state`
fixture builds a synthetic `backlog/` that never contains this archival path.
Neither the drift branch nor the presence gate is pinned. A refactor touching
the constant, the `join(root, …)` base, or the finding classification would
remove the only mechanical backing for a live secret-scanner exemption with no
suite failing.

The check does work today — the reviewer confirmed the on-disk file's SHA-256
matches `PHOENIX_HISTORY_SHA256` byte for byte.

### F3 — the push-guard destination-resolution change is untested

`resolveImplicitPushDestination` gained two refusal branches (local-branch
existence, same-named-tag collision) and `attestedMainPublication`'s contract
comment was rewritten to state that ordinary `git push origin main` is now
admitted on the same footing as the fully-qualified form.
`plugins/pipeline-core/hooks/guard-push.test.mjs` exists and already references
the function, but the delta does not touch it — while the same delta *did* add
tests for two other changes, so the standard is the author's own.

The behavioural consequence is real: before, a bare `git push origin main`
never resolved and was always refused by the publication boundary; it can now
be admitted with a valid attestation. The reviewer verified the boundary still
fails closed on an unresolved destination, so nothing escapes it today — but
neither the new refusals nor the widened admission is pinned.

## Triage

- **Decision:** open, unassigned. F1 first — it is a wording fix to a security
  contract and the cheapest of the three. F2 and F3 are test-coverage gaps on
  behaviour verified to fail closed as written.

## Closure, 2026-08-29

All three findings were already fixed by an earlier, differently-named
dispatch (`NVA-PHXMINOR-1`, 2026-08-27/28) before this item was ever
re-triaged this session — this item's own `status`/Triage were simply never
updated to reflect it. Found by dispatch `NVA-R14-PHOENIXCRITIC`, which
stopped and reported honestly instead of re-doing already-green work, then
independently confirmed by the dispatcher against `git log`:

- **F1** (`.gitleaks.toml`/`backlog/README.md` wording): fixed in `c478c648`
  ("correct overstated pin scope in the Phoenix-history exemption comments").
- **F2** (`checkPhoenixHistoryImmutable` fixture coverage): fixed in
  `7c4c5fc6`; `check-backlog-state.test.mjs` carries `CBS11`/`CBS12`/`CBS13`,
  covering the absent-path stand-down, the drift-detected block, and the
  matching-bytes hold — confirmed present by name.
- **F3** (`resolveImplicitPushDestination` behavior coverage): fixed in
  `b774f74b`; `guard-push.test.mjs` carries `PG12s16`–`PG12s20`, covering the
  attested bare-push admission, the tag-collision refusal, the no-local-
  branch refusal, the configured-refspec refusal, and the unattested-
  resolution control — confirmed present by name, 168/168 passing.

The original `done_when` predicate (`contains guard-push.test.mjs
resolveImplicitPushDestination`) never matched, because the real coverage
tests the behavior through `evaluateGuardPush`'s argv-shape scenarios rather
than naming the function literally in a comment or string — a measurement
gap, not a substance gap. Repointed to `PG12s16`, the actual first test name
of the F3 coverage block, which is genuinely present.

**Lesson for future dispatches on this backlog:** re-verify a "still open"
claim against `git log` for the affected files before dispatching work on
it, not only against the item's own `status:` field — this item's `status`
had drifted stale relative to the code for at least a day.
