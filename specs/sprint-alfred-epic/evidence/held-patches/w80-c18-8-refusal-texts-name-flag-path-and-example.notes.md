# w80 - C18-8: refusal and help texts name the flag, the checked path and one working example

## What

Held patch `w80-c18-8-refusal-texts-name-flag-path-and-example.patch` (base: the applied chain at c9a73fb80). Only texts change; no refusal code, no JSON `code` field and nothing a guard admits or refuses changes.

- `critic-dispatch-preflight.mjs`: a `CDP-ARGUMENT` refusal now also prints its human `reason` on the stderr JSON line (it used to be a bare code). A `--registration-commit` that is not a full commit id is refused with the flag named and "pass the full 40-hex commit id".
- `critic-diagnostic-evidence.mjs`: usage and help say `specs/<feature>/evidence/NAME.log|json` and name FPR-DIAG-PATH (the registration check), not a bare `evidence/`.
- `grammar-denials.mjs`: the grammar refusal (GUARD-PARSE-UNSUPPORTED and its siblings) names the one-command-per-call alternative to `cd <dir> && node --test ... | tail`, with an exported example; new exports `GRAMMAR_CD_TEST_ALTERNATIVE_EXAMPLE`, `POWERSHELL_GRAMMAR_EXAMPLES`, `READ_TARGET_EXACT_FILE_ADVICE`.
- `read-scope.mjs`: GUARD-READ-TARGET (native Read/Grep/Glob) appends how to read a plugin file (exact file path, no glob).
- `powershell-dialect.mjs`: GUARD-POWERSHELL-GRAMMAR ends with one working example per refused shape (literal, New-Item, content write, read); its GUARD-READ-TARGET names an example too.

## Why

Candidate 18 plan rows C18-8 and C18-16, measured in a consumer run: CDP-ARGUMENT refused with no text (short SHAs refused, full ones worked); the diagnostic help named `evidence/...` while registration wants `specs/<feature>/evidence/`; the `cd ... && node --test ... | tail` refusal gave no alternative; GUARD-READ-TARGET fired 7 times on glob reads of plugin files; GUARD-POWERSHELL-GRAMMAR fired twice. Criterion binding: AC-239 is the closest existing accepted criterion. PRD and Spec are unchanged.

## Tests

- New (test-first, RED before the edit): `g23-read-help.test.mjs` case G23C004 feeds each printed example through `evaluateLifecycleReadyGuard` and asserts it is admitted, and that the refusals print them; two new cases in `critic-dispatch-preflight.test.mjs` (reason on stderr and short-id refusal; help paths). The g23 case counter moved 3 -> 4.
- Restated (QG-04): the `--unknown` direct-CLI assertion in `critic-dispatch-preflight.test.mjs` compared the whole stderr line to a bare code body. Criterion kept (exit 1, empty stdout, same schema/status/code); the body is compared without `reason`, and `reason` is asserted separately. Nothing weakened or removed.

## Not changed

Refusal codes and admission logic; `shell-grammar.mjs`, `evaluate.mjs` and `GRAMMAR_DENIAL_REMEDY_SHORT` (the second-denial short form carries no new line); `feature-package-registration.mjs`; `dispatch-briefing.mjs`; the model alias table.

## Not proven

- Existing case G23C001 of `g23-read-help.test.mjs` (`ls -lh ../` expected refused) fails in the scratch clone, before and after this patch: its fixture root lies inside the clone's `scratch/`, so `../` stays inside the project. Not caused by this change; not investigated further.
- Not run: `critic-diagnostic-evidence.test.mjs`, `check-consumer-safe-paths.test.mjs`, the guard-lifecycle-ready and pin suites that may match old refusal wording (budget). The Coordinator's Verify must run them.
- The plugin-file read advice is a text; its example uses a `<plugin root>` placeholder and is not run through the guard (the registered plugin root is not available in the fixture); the in-root Read form it relies on is.
- The new g23 case is in an existing registered file; no new test file needs registration besides this check.
