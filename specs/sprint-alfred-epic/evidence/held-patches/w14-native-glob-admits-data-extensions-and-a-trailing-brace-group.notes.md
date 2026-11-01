# Held patch notes — native Glob admits any non-credential extension and one trailing brace group (candidate 15c)

Patch: `w14-native-glob-admits-data-extensions-and-a-trailing-brace-group.patch` (Elephant-built in a scratch clone, tree untouched; the file name keeps the first version's wording).

## Why

PO 2026-11-01: "Glob and ls -lh are only reads, please allow them too." Measured: `ls -lh` was already admitted (no change). The native Glob tool refused every wildcard selector that did not end in one of twelve
source/document extensions, and refused any `{}` — so `**/*.json`, `*.patch`, `*.log`, `*.sh`, `*.toml` and `*.{md,mjs}` all ended in `GUARD-READ-TARGET` although a Glob lists names only (Toolbox friction item, D13).
PO tile answer 2026-11-01 (tile 7): the extension list is replaced by "all extensions except credential-shaped ones" instead of a longer allowlist.

## What

`plugins/pipeline-core/lib/guard/read-scope.mjs` `containedRelativeGlob`:

- A wildcard selector must end in ONE LITERAL extension (`.` plus 1-12 letters or digits, no wildcard in the extension). The extension is admitted unless it is credential-shaped:
  the shared credential basename regex of the passive read policy (`PASSIVE_READ_CREDENTIAL_ROOTS.secretBasenameRegex`: p12 pfx key pem kdbx opvault ppk pgp gpg asc cer p7b jks keystore ...) applied to a synthetic basename
  `x.<ext>`, plus the extensions `env token secret secrets crt der p8 pk8 output` (a short list this patch adds; the shared regex does not name them by extension). `output` stays refused because the task-output scope pins it
  (`guard-lifecycle-ready.test.mjs`, "the Glob selector allowlist still refuses an *.output pattern"). A new credential extension is added in one place (the set) or in the shared regex.
- ONE trailing brace group of two to eight such literal extensions (`*.{md,mjs}`) is admitted; every alternative must pass the extension test; the group is reduced to its first alternative before the unchanged checks
  (no hidden part, no `~`, no absolute path, no `..`, no `[]`, `\`, `$`, backtick). A brace anywhere else, a single-alternative group, a credential alternative, or text after the group stays refused.
- Still refused: patterns without a literal extension (`id_rsa*`, `**/*`, `*.*`, `*.m*`, `*.js?`), extensions longer than 12 characters, hidden parts, escapes.

Unchanged on purpose: the base-directory containment (`containedGlobBase`), the hidden-directory walk of the plain `*` lane (`qp4InRootWildcardListing`, `scratch/*` style), and the SEC-11 rule that Grep has no directory lane.
A negated Glob pattern is not built (native Glob has no negation; the rg `--glob '!...'` filter is D232).

## Tests

`claude-windows-guard-refuses-every-in-repo-read.test.mjs` AP9b (1 test): admitted `**/*.json`, `*.patch`, `*.log`, `*.sh`, `*.toml`, `*.csv`, `*.py`, `*.xml`, `*.tar.gz`, `*.docx`, `*.{md,mjs}`, `**/*.{md,json,yaml}`, `sub/**/*.{yml,yaml}`, `**/*.{py,rs,go}`;
refused for each credential extension (23, incl. `PEM`) in the plain, `**/` and brace forms; refused `*.{pem,md}`, `*.{md}`, `{docs,scratch}/*.md`, `docs/{a,b}/*.md`, `*.{md,mjs}x`, `*.{md,.env}`, `.*/*.{md,mjs}`, `../*.{md,mjs}`, an unclosed brace, `*.m*`, `*.*`, `*.js?`,
`id_rsa*`, `**/*`, a 13-character extension, nine alternatives, a `.git` base and an escaping selector.

Scratch clone, targeted: in-repo-read pin 17 tests (1 typed skip), `guard-lifecycle-ready.test.mjs` + read-blocks pin + passive-read-policy pin + case-completion suite 507 tests / 502 pass / 5 typed skips / 0 fail.
Pending: Full Verify, batch Critic, native Windows runs, PO acceptance.

## Residual risk (named)

The denylist is only as complete as the shared regex plus the short set above; a credential-bearing file with an extension in neither list can have its NAME listed (never its contents) by a wildcard Glob. Reading it still goes through the read policy.
