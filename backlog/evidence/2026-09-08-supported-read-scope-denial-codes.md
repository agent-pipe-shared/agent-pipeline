# Current read-scope denial-code evidence

Task: `NVA-B-READ-DENIAL-CODES-1`.

This record classifies current behavior only. Every observed command remains
refused; it claims neither an admission nor a grammar change.

Machine capture: `scratch/NVA-B-READ-DENIAL-CODES-1/current-supported-shapes-rg-cat.md`
(`NVA-B-READ-DENIAL-CODES-1-current-rg-cat-shapes`, exit 0).

| Guard-evaluated bounded shape | Exit | Current denial code |
| --- | ---: | --- |
| `rg -n Overall <outside> 2>/dev/null` | 2 | `GUARD-READ-SCOPE-OUTSIDE-ROOT` |
| `rg -n Overall <outside> && git status` | 2 | `GUARD-READ-SCOPE-OUTSIDE-ROOT` |
| `cat <outside> 2>/dev/null` | 2 | `GUARD-READ-SCOPE-OUTSIDE-ROOT` |
| `cat <outside> && git status` | 2 | `GUARD-READ-SCOPE-OUTSIDE-ROOT` |
| either read with `2>/dev/null && git status` | 2 | `GUARD-PARSE-UNSUPPORTED` |

The original F3 wording, “an `&&`-chained read of the same shape”, can mean a
combined redirect-plus-`&&` form. Current observations therefore do not prove
the historical `GUARD-REDIRECT-UNAPPROVED` or
`GUARD-OPERATOR-UNAPPROVED` codes. Both current combined forms reach
`GUARD-PARSE-UNSUPPORTED` because the existing splitter rejects the redirect
before chain admission. The bounded current reproductions above establish only
their reported present-day codes.

`scratch/NVA-B-READ-DENIAL-CODES-1/combined-proposed-expansion-red.md`
(`NVA-B-READ-DENIAL-CODES-1-rejected-combined-expansion`, exit 1) preserves a
current RED assertion for the rejected proposal to classify the combined form
as read-scope. It is not evidence of the historical F3 redirect/operator
diagnostic. Earlier RG-only capture remains at
`scratch/NVA-B-READ-DENIAL-CODES-1/current-supported-shapes.md`.

Post-check lifecycle evidence:
`scratch/NVA-B-READ-DENIAL-CODES-1/green-lifecycle.md`
(`NVA-B-READ-DENIAL-CODES-1-lifecycle-green-no-admission-change`, exit 0;
250 passed, 0 failed). The consumer-safe-path check also passed: `node --test
harness/scripts/check-consumer-safe-paths.test.mjs` (exit 0; 9 passed).
