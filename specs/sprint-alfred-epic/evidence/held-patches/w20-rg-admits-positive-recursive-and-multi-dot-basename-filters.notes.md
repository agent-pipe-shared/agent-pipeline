# Held patch notes — rg admits positive recursive and multi-dot basename filters (candidate 15c, follows D232)

Patch: `w20-rg-admits-positive-recursive-and-multi-dot-basename-filters.patch`. Generated on top of the D232 patch and its T77 restatement; apply AFTER `w15-restate-the-rg-glob-pin-t77-for-the-negated-filter-d232`
(it does not apply on the bare tree).

## Why

PO tile answer 2026-11-01 (tile 3): admit the POSITIVE rg glob filters `**/*.ext` and multi-dot extensions (`*.tar.gz`, `**/*.d.ts`); nothing broader (no brace groups, no path segments).

## What

`plugins/pipeline-core/hooks/guard-command-grammar.mjs` `isBoundedFilenameFilter`: one more admitted positive shape,
`^(?:\*\*\/)?\*\.(?:<seg>\.){0,2}<seg>$` with `<seg>` = `[A-Za-z0-9][A-Za-z0-9_-]{0,15}` (the bound the negated form already uses). A `**/` before a bare basename pattern names the same files as the pattern alone, because a basename glob already matches
at any depth; up to three literal dot-separated segments stay filename data. Still refused: another path segment (`scratch/*.md`, `**/sub/*.md`), `**/**/`, `**/*`, a hidden name, a brace group, `[]`, `?`, a wildcard inside an extension (`*.m*`), four or more dot segments.

Restated with named intent (QG-04; SEC-11 intent unchanged — a filter stays a bounded basename filter): `g23-read-help.test.mjs` (the positive list moves `**/*.md` and `*.tar.gz` from refused to admitted, new refused cases),
`g23-quoted-pipeline-reads.test.mjs` (`*.tar.gz`, `*.test.tar.gz`, `**/*.mjs` move to the admitted checks; `**/sub/*.mjs` is the new refused case), `claude-windows-guard-refuses-every-in-repo-read.test.mjs` and `guard-lifecycle-ready.test.mjs` T77.
Pinned assertion counts in `harness/scripts/check-verify-case-completion.test.mjs`: g23-quoted-pipeline-reads 17 -> 18, g23-read-help 19 -> 20 (the D232 patch had moved it 14 -> 19). Only these numbers change.

## Not changed

The operand checks (credential, hidden, escaping targets), `--no-ignore`/`--hidden` handling, and the external-directory rule for filtered searches. Residual (unchanged class): a positive glob overrides rg's ignore rules for the matched basenames, as `*.mjs` always did.

## Evidence

Scratch clone with D232 + T77 applied: g23-read-help, g23-quoted-pipeline-reads, in-repo-read pin, guard-lifecycle-ready and case-completion suites 479 tests / 474 pass before the count bump (only VCR01 red), VCR01 32/32 after it.
Pending: Full Verify, batch Critic, native runs, PO acceptance.
