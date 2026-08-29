---
schema: pipeline.backlog-item.v1
id: pipeline.guard-root-admission-compares-typed-to-realpathed
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
done_when: contains plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs realpathSync(resolve(value))
tracking: "NOW / Nova A — the surviving candidate cause for a consumer session that lost both its lanes on Windows, and a platform-neutrality defect in the guard that decides whether any recovery command runs at all"
source: "Found 2026-08-28 while independently verifying dispatch NVA-G-GUARDDEADLOCK's negative result against guard-lifecycle-ready.mjs. The dispatch refuted the reported cause of HA incident report S56 finding B3 and named this as the most plausible remaining one; the code was then re-read here to confirm the mechanism exists."
---

# The guard admits a recovery command by comparing a typed path against a realpath'd one

## What was ruled out first

HA incident report S56 finding B3 reported that `guard-lifecycle-ready.mjs` refuses the
very command its own refusal prescribes. That was investigated
(`2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md`) and **the
reported cause does not hold**: `sanctionedOnboardingArgs()`'s `inspect` branch admits
`inspect --root <root> [--intent <value>]` with `session` in the intent enum, and it is
reached unconditionally of `lifecycleStatus`. Verified twice — by reading the admission
path here, and by the dispatch calling `evaluateLifecycleReadyGuard()` directly with
`migration-required` and `partial` mocked, both admitted.

So the guard's admission logic is right, and something else refused that session.

## The mechanism that can still refuse it

Admission compares the caller's literal argv string against a resolved path:

```js
root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot));
...
const isRootValue = (value) => value === root;
```

`value` is the raw token the caller typed after `--root`. `root` is that path after
`resolve()` and `realpathSync()`. Admission therefore requires the two to be **byte
identical**, with no normalisation, no case folding, and no separator tolerance.

On POSIX, where the session and the guard agree on spelling, this holds by accident of
uniformity. On Windows it is a coin flip: drive-letter case, `\` versus `/`, a short
(8.3) versus long component, or a substituted/junctioned drive all produce a
`realpathSync(resolve(x)) !== x` where a human — or a runner rendering a command for a
human — typed the other spelling. The reported incident was on Windows.

## Why this is worse than an ordinary strict comparison

The refusal that fires here is the one that **names the command to run**. So the failure
mode is not "a command was refused" but "the guard told the session to run a command and
then refused that command because of how its path was spelled". The session has no way to
see the difference: the denial text is identical either way, and the guard never prints
the `root` it compared against.

This is the same shape as the two sibling defects already filed this week — a fail-closed
refusal that names no predicate, and a gate demanding a byte-exact human input — and it
lands on the one code path whose whole job is to keep a stuck session recoverable.

## Not claimed

That this *is* what happened in HA. The incident's literal command line and denial stderr
were not captured, and without them this stays the most plausible cause rather than the
confirmed one. Two other candidates remain open and are not excluded: the PowerShell lane,
where `isSanctionedLifecycleCommand` is never reached at all, and a genuine deviation in
the issued argv. What is established here is only that the mechanism exists and would
produce exactly the reported symptom.

## Direction

1. Compare **resolved against resolved**, not typed against resolved: run the caller's
   `--root` value through the same `resolve()` + `realpathSync()` the guard applies to its
   own root before comparing, and compare the results. A path that does not resolve stays
   refused, as today.
2. When a comparison of this kind refuses, say so and show both sides. The guard's refusal
   already prints the command to run; it must not stay silent about the one value that
   decided the outcome.
3. There are three independent copies of the WSL/Windows path normalisation in this
   repository (`2026-08-27-three-independent-copies-of-the-wsl-windows-path-normalization.md`).
   Do not add a fourth here — take the comparison from whichever of those is the reviewed
   one, or make this the reason to consolidate them.

## Acceptance criteria

- The admitted argv shapes accept every spelling of the project root that resolves to the
  project root, and no path that does not.
- A test drives the mismatch shapes that occur in practice — differing separator, differing
  drive-letter case, a symlinked or junctioned parent — and asserts admission is unchanged
  by spelling. Platform-specific cases run under the platform guard this repository already
  uses for its win32 tests rather than being skipped.
- A refusal caused by a root mismatch is distinguishable from a refusal caused by an
  unadmitted command shape.
- No path that resolves outside the project root becomes admitted.

## Related

- `2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md` — the item whose
  reported cause this replaces.
- `2026-08-27-three-independent-copies-of-the-wsl-windows-path-normalization.md` — where the
  comparison should come from.
- `2026-08-28-a-consumer-project-must-allowlist-every-runner-lane-itself.md` — the second
  closed lane that turned the incident into a total stop.
