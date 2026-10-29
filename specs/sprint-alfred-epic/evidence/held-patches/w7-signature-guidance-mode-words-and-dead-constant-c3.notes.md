# Held patch notes: slice A2-c3, the signature continuation names the configured mode again; the unused approval script constant goes

Base: the candidate commit, then held patches A2 and A2-c2 applied in that order and staged (no commit).
Patch: `w7-signature-guidance-mode-words-and-dead-constant-c3.patch` (`git diff --binary` of the working tree against the index; 4 files).

## Cause

- A2 replaced the sign-intent sentence, which carried `gates.human_approval is "<mode>"`; the one-command sentence no longer states the mode.
- `PO_HUMAN_APPROVAL_SCRIPT` stayed defined in `codex-pretool-guard.mjs` and `antigravity-pretool-guard.mjs` with no remaining use (rg in the clone: no other occurrence in either file; no import existed only for it, `join` and `PLUGIN_ROOT` are still used).
- `hooks/guard-testpath.mjs` does NOT have the leftover (no definition of the constant there; unchanged). `hooks/guard-gate-strength.mjs` still defines and USES it (line 739); not touched.

## Changed lines

- Both hooks: inside the single continuation sentence the parenthesis became `(it needs no external key, ADR-0059 Decision 1; gates.human_approval is "${approvalMode}")`, using the `approvalMode` already in scope. The codex one-command pin text is unchanged.
- Both hooks: the `PO_HUMAN_APPROVAL_SCRIPT` constant line removed.
- `codex-pretool-guard.test.mjs`, check ADR-0059 Decision 4, signature branch: added an assertion that the reason includes `gates.human_approval is "<committed mode>"`; the justification comment now says the clause is back. The existing `prepare-for-signature --repo` pin and all refusals are kept.
- `antigravity-pretool-guard.test.mjs`: new case "Antigravity signature continuation names the configured mode inside the one-command sentence (slice A2-c3)" (pins the whole sentence including the mode clause, then the `prepare-for-signature --repo` line). No existing case changed.

## RED then GREEN (clone)

- RED, before any production edit (log-red): codex `not ok 16 - ADR-0059 Decision 4: ...` (new, besides baseline reds 7 and 17); antigravity new case `not ok` with "the one-command continuation must name the configured approval mode".
- GREEN after the edit: codex case 16 ok; antigravity "All 67 antigravity-pretool-guard tests passed" (66 + the new case).
- A separate reverted-sentence re-run was NOT done; the RED run against the unchanged code above is the evidence the assertions can fail. No restore step was needed.

## Whole-file results, baseline (clone2: base patches only) vs patched (clone)

| Suite | clone2 baseline | clone patched |
|---|---|---|
| codex-pretool-guard.test.mjs | fails exactly 7 and 17 | fails exactly 7 and 17 (identical set; case 16 green) |
| antigravity-pretool-guard.test.mjs | 66 passed, exit 0 | 67 passed, exit 0 |
| guard-lifecycle-ready.test.mjs | tests 414, pass 411, fail 0 | tests 414, pass 411, fail 0 |
| signature-ceremony pin file | 21 of 21 | 21 of 21 |
| generate-architecture-overview.mjs --check | current | current |

Baseline reds 7 (slow push guard share) and 17 (Pipeline Author Repair) are untouched. `check-verify-case-completion.test.mjs` was not run and not touched (no new test count pin was triggered by a failing run; not verified).
Apply check: `git apply --check` of the patch in clone2 (base patches staged) exit 0.

## Observation

The pre-existing antigravity case "Antigravity signature guidance assigns only sign-intent..." still pins the former four-step text yet is reported passing in both trees; I did not investigate why (left untouched).

## NOT done

Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance. The reverted-sentence re-run (see above).

## Proposed commit message

fix(hgo): name the configured approval mode again in the signature continuation and drop the unused approval script constant (slice A2-c3)

## Operator flow

Apply the diff on top of A2 and A2-c2, `git add -u` with a path limit to the four files, commit with `--no-verify`, stamp, install.
Protected-path classification observed: none of the four files matches a TP pattern in the obligations table; `hooks/*-pretool-guard*` are guard sources, so apply under the ceremony used for guard files.
