# Held patch notes — native Glob admits data/log extensions and one trailing brace group (candidate 15c)

Patch: `w14-native-glob-admits-data-extensions-and-a-trailing-brace-group.patch` (Elephant-built in a scratch clone, tree untouched).

## Why

PO 2026-11-01: "Glob and ls -lh are only reads, please allow them too." Measured: `ls -lh` was already admitted (no change). The native
Glob tool refused every wildcard selector that did not end in one of twelve source/document extensions, and refused any `{}` — so
`**/*.json`, `*.patch`, `*.log`, `*.sh`, `*.toml` and `*.{md,mjs}` all ended in `GUARD-READ-TARGET` although a Glob lists names only
(Toolbox friction item, D13).

## What

`plugins/pipeline-core/lib/guard/read-scope.mjs` `containedRelativeGlob`:

- The wildcard extension list gains `json`, `jsonl`, `patch`, `log`, `sh`, `toml`, `csv` (one constant, `GLOB_LISTING_EXTENSIONS`).
- ONE trailing brace group of two to eight extensions from that same list (`*.{md,mjs}`) is admitted; it is reduced to the first plain
  extension form and then runs through exactly the checks the plain form runs (no hidden part, no `~`, no absolute path, no `..`, no
  `[]`, `\`, `$`, backtick). A brace anywhere else, a single-alternative group, an alternative outside the list, or text after the
  group stays refused.

Unchanged on purpose: credential-shaped extensions (`pem`, `key`, `env`, `output`) stay out; the base-directory containment
(`containedGlobBase`), the hidden-directory walk of the `*` lane (`qp4InRootWildcardListing`), and the SEC-11 rule that Grep has no
directory lane. A negated Glob pattern is not built (native Glob has no negation; the rg `--glob '!…'` filter is D232).

## Tests

`claude-windows-guard-refuses-every-in-repo-read.test.mjs` AP9b (+1 test): admitted `**/*.json`, `*.patch`, `*.log`, `*.sh`, `*.toml`,
`*.csv`, `*.{md,mjs}`, `**/*.{md,json,yaml}`, `sub/**/*.{yml,yaml}`; refused `*.{pem,md}`, `*.{md,pem}`, `*.{md}`, `{docs,scratch}/*.md`,
`docs/{a,b}/*.md`, `*.{md,mjs}x`, `*.{md,mjs}/*`, `*.{md,.env}`, `.*/*.{md,mjs}`, `../*.{md,mjs}`, an unclosed brace, `*.pem`, `*.key`,
`*.output`, a `.git` base and an escaping selector.

Scratch clone, targeted: the in-repo-read pin suite 17 tests (1 typed skip), `guard-lifecycle-ready.test.mjs` + the read-blocks pin + the
Critic-budget pin 456 tests / 452 pass / 4 typed skips / 0 fail, `check-verify-case-completion.test.mjs` 32/32 (this pin suite carries no
pinned assertion count). Not run: Full Verify, batch Critic, native Windows runs, PO acceptance.

## Open

Whether the shell `ls` lane or another path produced the PO's original refusal is not established (tile in
`scratch/pending-po-tiles-2026-11-01.md`); a refusal of a Glob with a selector outside the list now names no new cause.
