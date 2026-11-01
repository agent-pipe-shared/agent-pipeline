# w61 — a forward-slash `--root` is normalised on win32 before the strict physical-path checks (candidate 17)

Applies on the nine-patch chain; independent of w56–w60.

## What went wrong

Script entries that demand "the exact physical path" compare the raw `--root` with `resolve(root)` and `realpathSync(root)`. On win32 both return backslash paths, so a drive-letter root
typed with forward slashes (accepted by every runner host and most shells) was refused with `DRC-ROOT` / `COR-USAGE` although it names the same directory. The strictness exists to reject
`..`, symlinks and relative paths, not the separator spelling. Found in the native-Windows consumer run; roughly fifty script sites carry the same pattern.

## Change

- New `lib/root-argument.mjs`: `normalizeRootArgument(value, platform)` replaces `/` by `\` and only on win32; any other platform and any non-string is returned unchanged. `..`, case and
  trailing separators stay refusals for the strict check that follows.
- Used at the two entries whose raw argument feeds the strict check directly: `dispatch-recovery.mjs` (`--root`, before `checkRoot`) and `continuity-owner-route.mjs` (`run` and `release-orphan`).
- Tests: helper unit cases with an injected platform, plus source pins that both entries normalise before comparing. Dispatch-recovery suites (13) and the owner-route consumer suite (29) pass.

## Not changed / not proven

- Not run on native Windows. The helper is only exercised through an injected platform string; the two entries are checked by source pin, not by a Windows execution.
- The other roughly forty `resolve(root) !== root` / `realpathSync(root) !== root` sites (design-course-session, close-coordinator, onboarding-init, pipeline-state, ...) are untouched: each needs its own
  look at whether its raw argument is user-supplied, and the native-Windows run is the way to find the ones that matter. Candidate for the Windows native-gate round.
