# S2 package 2: forward-slash preflight path spelling (FSLASH-P)

Patch: `fslash-guard-module.patch` (unified diff, `a/` `b/` prefixes, NOT applied).

## Targets (current committed `plugins/pipeline-core/lib/guard/`)

- `constants.mjs` (after `START_PREFLIGHT_SCRIPT`, ~line 148): new exported `sameSanctionedScriptPath(spelled, sanctioned, platform)`.
- `command-catalogue.mjs`: import (line 10) and `sanctionedLifecycleScriptArgs` (line 145); `options` is in scope.
- `sanctioned-args-scripts.mjs`: import (line 9) and `isSanctionedStartPreflightInvocation` (line 603); `options` is in scope.

Three modules, not two: the constant lives in `constants.mjs`, one call site in each of the other two; the helper is exported from the defining module and imported at both sites.

## Protection and ordering

`lib/guard` is extended into PB-GUARD-HOOKS by package 1. Apply this patch only AFTER package 1, then review it on the security Critic route. The Elephant runs `git apply --check` first. Hunks use fewer than 3 trailing context lines in places (file-position-bound lines); if line endings in the checkout are CRLF the patch needs `--ignore-whitespace`.

The regression test `plugins/pipeline-core/scripts/pipeline-start-preflight.path-spelling.test.mjs` (5 `todo` cases) is expected to turn green.

## Matrix (expected effect)

POSIX behaviour is unchanged everywhere (exact string equality only). On win32 the guard additionally accepts separator (`/` vs `\`) and case variants of the same file; dot segments and other paths still miss.

| Runner | native Windows | WSL | macOS |
|---|---|---|---|
| Claude (own / consumer repo) | accepts `/` and case variants | unchanged | unchanged |
| Codex (own / consumer repo) | accepts `/` and case variants | unchanged | unchanged |
| Antigravity (own / consumer repo) | accepts `/` and case variants | unchanged | unchanged |

Own and consumer repositories behave identically: the comparison is against the plugin's own script path, independent of the project root.

Status: independent review pending; PO acceptance open.
