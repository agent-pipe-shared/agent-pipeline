# w165 — a pending-unavailable Goldfish stop failure names its cause and the recover helper (candidate 19c, E1 text part)

Built by the Elephant in a clone at the stamped candidate 19a (`6193380d0`). The Claude Windows greenfield run saw 8 times: "A background Goldfish host commit failed at its stop (NGHF-PENDING-UNAVAILABLE) for <slice> ... No commit or authorship record is claimed; inspect the worktree and recover explicitly." The message named neither why there was no pending state nor the command that recovers it, although `scripts/goldfish-host-commit-recover.mjs` (plan, then apply by digest) already exists. The Windows session confirmed the wording on 2026-11-04 and that the PreToolUse step printed only a slicing hint.

## What it changes

- `hooks/native-goldfish-host.mjs`: `stopFailureNotice` appends, for the code `NGHF-PENDING-UNAVAILABLE` only, the cause (no pending host-commit state when the tool call returned, the normal case of a background launch) and the recovery: `scripts/goldfish-host-commit-recover.mjs plan --root <root> --dispatch-id <id>`, check the planned paths, then the same command as apply with the printed `--expect-sha256`. Every other code keeps the old text.
- `lib/native-goldfish-host-finalizer-regression.test.mjs`: case NGHF08 pins both (not added to the declarative case-completion list, like NGHF07).

## Checks

- Clone: the regression suite runs 4 cases (NGHF05 to NGHF08), exit 0. `git apply --check` against the 19a state: exit 0.

## Not changed / not proven

- The cause on Windows (why no pending state existed at PostToolUse) stays unproven; the Windows run did not return the hook state directory. The typed orchestrator-commit helper that writes the dispatch record (E1 second half) is not built.
- No Full Verify; independent Critic review not run for this slice.
