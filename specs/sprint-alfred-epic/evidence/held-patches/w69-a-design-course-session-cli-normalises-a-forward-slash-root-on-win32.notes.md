# w69 — the design-course-session CLI normalises a forward-slash root on win32 (candidate 17)

Applies after w61 (it uses `lib/root-argument.mjs` and extends its pin test). Source change of one line plus an import.

## What and why

w61 introduced `normalizeRootArgument` for the two entries that compare a raw `--root` argument with `resolve()` and `realpathSync()`. Reading the other roughly forty strict-root sites showed that the number overstated
the problem: most CLI entries (`close-coordinator`, `bound-path-status-report`, `critic-export-consent`) already pass the argument through `resolve()` first, which on win32 turns forward slashes into backslashes, and
a few strict checks sit in retired code (`design-course-coordinator`) or behind internal calls that receive an already-resolved root. `design-course-session.mjs` is the third raw entry: `parseCli` stores `--root` and
`--plugin-root` untouched and `design-course-session` later demands `resolve(root) === root`. This patch normalises exactly those two values in `parseCli`.

## Not changed / not proven

- What remains on Windows is a different class: drive-letter case and short-name spellings between `realpathSync` and the supplied root. That cannot be reproduced or fixed blind on Linux; the native Windows run is the way to find it.
- Not executed on Windows; the helper is exercised through an injected platform and the entry by a source pin (12 tests pass across the helper test and the design-course-session suite).
