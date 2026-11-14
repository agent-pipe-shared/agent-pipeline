# ADR-0099: An Antigravity branch result lands with the child's own commits

> Agent-Pipeline · Sprint Alfred · 2026-11-14

**Status:** accepted (2026-11-13, PO tile "R5: build a harvest command", register D251). Built in candidate 29d. Not yet run in a real Antigravity session.

**Context source (PO tile, 2026-11-13, Antigravity test run 3, item R5, Toil P3):** the PO chose the recommended harvest command for `Workspace: "branch"` children: fetch the worktree HEAD, keep the authorship, write the observation.

## Context

An Antigravity code-writing child runs in its own git worktree on a `subagent-<...>` branch, cut from the parent's committed HEAD. Its commits land in the shared object database. Nothing is merged back. The take-over route (`agy-native-integrate.mjs`, candidate 20, C28C) applies the branch's net change to the Elephant's working tree. The recovery route then makes one new commit, `Commit-Act: orchestrator`, and writes an `orchestrator-attested` dispatch record.

In the test run the Elephant harvested several branches by hand. The Critic noted as a minor that the landed commit was the orchestrator's, not the child's. The child's commits, its authorship and its own `Dispatch:` trailers were dropped. The D40b commit scan already counts a Goldfish's own commit with the exact trailer as integrated, so nothing beyond keeping those commits is needed.

## Decision

1. **`apply --keep-authorship <dispatch id>`.** It lands the child's commits unchanged with `git merge --ff-only`. HEAD becomes the child's tip, so there is no new commit and nothing is rewritten. It excludes `--commit-dispatch-id`.
2. **Only when it is a real fast-forward of checked commits.** `plan` reports `fastForward.eligible` only when all of these hold:
   - the merge base is the current HEAD;
   - every commit in `HEAD..tip` carries exactly one `Dispatch: <id> (goldfish)` trailer, with the same id throughout, and `AI-Assisted: true`;
   - the existing plan checks pass (briefed scope, no merge, a clean target and a change that applies).

   A fast-forward runs no commit-msg hook, so the script checks the trailers itself, per commit. `apply` refuses a briefed id that differs from the commits' id. Anything else keeps the patch route, which is unchanged.
3. **The evidence label stays honest.** The script runs in the Elephant's session, not in the host. It writes the existing take-over record (`agy-native-integrated`) and no dispatch record. Its `next` names the existing attested writer (`dispatch-record-write.mjs --attested-request`) over exactly the landed commits. That record says `orchestrator-attested` and never claims a host observation.

   Antigravity writes a per-child descriptor (`.system_generated/subagents/<childId>.json` with its `workspaceUris`). Binding it by digest would be a host-written fact about the child. That is not built. Whether the record may carry it, and under which label, is an open PO question (AFK tile T6).
4. **The guard admits exactly one more flag.** `apply` may carry one `--keep-authorship <id>` in place of `--commit-dispatch-id`. The two flags exclude each other, and `plan` takes neither.

## Consequences

- When the parent has not moved since the child's branch was cut, a sequential Antigravity child lands as its own commits. HEAD then moves, so a second parallel child no longer fast-forwards and uses the patch route. Its `fastForward.reason` says so.
- The antigravity-native-dispatch reference names both routes.
- The pins are two "C29 R5" cases and the guard argv case in `lib/pins/antigravity-native-goldfish-dispatch-needs-consent-and-has-no-parent-binding.test.mjs`.
- Not covered:
  - binding the host descriptor (T6);
  - a branch whose commits were made in the parent's own checkout;
  - a child commit that names its dispatch in another trailer spelling. That commit is refused, never guessed.
