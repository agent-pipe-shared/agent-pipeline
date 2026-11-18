# w313B — the pins of the grammar refusal trim are restated (candidate 31, C31-C3B, follow-up of w313)

Delta on w313: apply the base clone of candidate 31 (`scratch/agent-out/c31/int` state, including w313) first, then this patch. It does not apply to the real checkout on its own; its check test does not run `git apply`.
Closest existing accepted criterion: AC-112. The PRD and the Spec are unchanged.

## What it changes (tests only, no production change)

- `lib/pins/grammar-listing-once-per-context-window.test.mjs` line 16: `SHORT` now matches `/already printed on an earlier grammar refusal in this context window/u` (the new short text of w313).
- `hooks/guard-lifecycle-ready.test.mjs`, the AC-1/AC-2/AC-3 denial-trim case:
  - the short-text regex (about line 10069) is replaced by the same new regex;
  - the "different code, same session" assertion (about lines 10081 to 10088) is restated to the intended opposite: a DIFFERENT listing code (`GUARD-PARSE-UNSUPPORTED`) in the same session now does NOT match the full header and DOES match the new short text. The `GUARD-PARSE-UNSUPPORTED` code assertion is kept.
- The AC-6 pin (stored `seenClasses` holds both raw codes) is unchanged and green.

## Why (QG-04)

w313 intentionally changed the short wording and made the four listing codes one class. The old pins restated the old behaviour. They are restated, not weakened: each still fails on a regression to the old short text (the regex is specific to the new wording) and the cross-code assertion now fails if a second listing code prints the full header. The deliberate local mutation of the production text was NOT run (see "Not proven").

## Test first

RED before the edit (clone with w313, old pins): `grammar-listing-once-per-context-window.test.mjs` 4 cases, 3 pass, 1 fail (old regex vs the new text). GREEN after the restatement: 4 of 4.

## Suites run (one at a time, in the clone, with the patch)

- `lib/pins/grammar-listing-once-per-context-window.test.mjs`: 4 of 4 pass.
- `hooks/guard-lifecycle-ready.test.mjs`: started with the patch applied; it ran past the tool budget window without printing a result (the runner prints only at the end). NOT RUN TO A RESULT.

## Not changed / not proven

- No production change; no gate, signature, approval or stored status touched.
- NOT RUN: `hooks/antigravity-pretool-guard.test.mjs`, `lib/guard/diagnostic-toil-cross-runner.test.mjs`, `lib/guard/no-route-denials-seed-no-override-request.test.mjs`, `lib/guard/devplan-shell-sanctioned-recovery.test.mjs`, `lib/guard/g23-read-help.test.mjs` (located under `lib/guard`, not `lib/pins`). Pre-existing vs trim-caused classification therefore open; the `int` base contains no trim-free baseline for these to compare against.
- The mutation check (revert the short text, see the pin red) was not run.
- The restated cross-code assertion in the lifecycle case is read from the code, not observed: the case fails earlier-or-equal only if reached.
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: this change is verified by tests only.
