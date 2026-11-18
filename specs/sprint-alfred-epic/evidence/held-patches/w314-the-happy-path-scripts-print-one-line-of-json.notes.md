# w314: the happy-path scripts print one line of JSON (candidate 31, lane C31-C4, item B2)

## What

The indent argument of `JSON.stringify` is dropped at four of the five B2 sites, so stdout is exactly one line and `JSON.parse` yields the same value as before (17 to 21 percent fewer bytes):

- `plugins/pipeline-core/scripts/pipeline-state.mjs`: the `inspect` print (one edit, no reformatting).
- `plugins/pipeline-core/scripts/finish-feature.mjs`: the one-shot print and the normal print.
- `plugins/pipeline-core/scripts/dispatch-briefing.mjs`: the CLI result print (success and typed refusal).

The fifth site, `prepare-dispatch.mjs`, belongs to another lane and is untouched. Per decision D3 (default: yes, only these sites) the other `pipeline-state.mjs` sites keep their indent.

## Tests (test first)

Three process-level assertions were written first and were RED against the unchanged code (stdout contained newlines): `pipeline-state-inspect.test.mjs` (new case "inspect process stdout is exactly one line of JSON with the same value"), `finish-feature.test.mjs` (case P3, extended in place), `dispatch-briefing.test.mjs` (case "the command line prints a typed refusal as JSON and exits 2", extended in place). Each asserts a single line, a trailing newline, and that stdout equals `JSON.stringify(JSON.parse(stdout))` plus newline. After the edit all three suites are GREEN: inspect 32/32, finish-feature 107/107, dispatch-briefing 203/203. No existing pin matched the multi-line text, so no pin needed restating (QG-04: none).

## Not changed

Every key and value, exit codes and the stderr next-step lines. No stored status, record shape, digest or key bytes, gate, signature or approval. The files that `pipeline-state.mjs` writes pretty-printed stay pretty-printed (they are hashed bytes).

## Not proven

- Verified by tests only. The Critic is suspended by the PO for candidates of this repository and no Full Verify ran.
- Token savings were not measured (bytes only, per the recon note).
- The normal (non one-shot) `finish-feature` print has no process test of its own; it is the same one-line edit as the one-shot print.

## Binding and order

Criterion binding AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged. The patch is a delta on the base clone of candidate 31 and does NOT apply to the real checkout until that base clone is applied first.
