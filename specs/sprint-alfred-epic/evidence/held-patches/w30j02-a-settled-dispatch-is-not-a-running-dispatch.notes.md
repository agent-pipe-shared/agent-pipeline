# w30j02 — a settled dispatch is not a running dispatch (candidate 30j, C30J-J2, analysis C1, finding I5)

Edits `plugins/pipeline-core/lib/dispatch-record-liveness.mjs`, its test, `plugins/pipeline-core/scripts/dispatch-briefing.mjs` and its test only. Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text); the PRD and the Spec are unchanged. The patch is a delta on the integrated 30i tree: apply that tree first, then this patch (it does not apply to the real checkout alone; `git apply --check` was exit 0 against the integrated 30i clone).

## What it adds

- `settledIntegratedDispatchIds(rows)` (lib, pure): from the `reservations` rows of `session-authority-repair.mjs inspect` it derives the dispatch ids settled as `integrated` or `integrated-by-commit`. `cancelled` is not proof; one unsettled or cancelled row of the same dispatch vetoes the id.
- `readRunningDispatches(root, { settledIdsFn })`: an `unjudgeable` record whose dispatch id is in that set is no longer listed as running. An `alive` record always counts. A throwing or empty readback drops nothing, so an unjudgeable record is still announced.
- `dispatch-briefing.mjs`: the default reader supplies the set by spawning the read-only `inspect` verb (a failure means nothing is dropped); `deps.settledDispatchIds` is the test seam. The `DBG-SCOPE-OVERLAP` refusal and the `DBG-RUNNING-SCOPE-UNKNOWN` warning text are unchanged.

## Why

A finished dispatch whose pending reservation was settled but whose record had no owner process stayed "running" for as long as the record existed, so a warning appeared although nothing ran. Nothing is stored: the fact is derived from rows already computed.

## Tests

Written first, RED against the original code (the lib test file failed on the missing export), then GREEN: `C30J-J2-1..4` in the lib test (settled drops; alive stays; no settled or failing readback stays announced; cancelled/unsettled is no proof) and one case in the briefing test (default reader, settled vs not settled). No existing case changed. Verified by tests only: the Critic is suspended by the PO for candidates of this repository and no Full Verify ran.

## Not changed / not proven

- `scripts/dispatch-record-liveness.mjs` (the guard-side script) is unchanged: it keeps listing unjudgeable records as before; only the briefing reader derives the settled set. No record shape, key bytes, digest, gate or signature changed.
- The `inspect` spawn is real only in the default path; the settled case against a real registry with a native integration record was not exercised end to end.
- The guard-side hook still announces an unjudgeable settled record (`GUARD-DISPATCH-SECOND-WRITER-UNJUDGED`); that is a separate path.
