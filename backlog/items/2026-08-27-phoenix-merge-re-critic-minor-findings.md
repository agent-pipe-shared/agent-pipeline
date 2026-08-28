---
schema: pipeline.backlog-item.v1
id: pipeline.phoenix-merge-re-critic-minor-findings
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-27
sprint: nova
tracking: "Reassigned from phoenix to nova on 2026-08-28 by PO decision, after the Phoenix line was intaked into Nova"
source: "Re-Critic (delta) on the Phoenix-merge rework diff 290bd599..eeebeed5, PASS with three minor findings, 2026-08-27"
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
