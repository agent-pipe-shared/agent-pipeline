---
schema: pipeline.backlog-item.v1
id: pipeline.agents-cannot-rerun-or-watch-a-ci-run
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-11-01
sprint: alfred
source: "Consumer request relayed by the consumer session (2026-11-01, PO wish): an agent may not restart a failed CI run, nor wait for its result; the PO had to restart it by hand."
---

# An agent can neither restart a CI run nor wait for its result

## What happened

A release run on a consumer's staging branch failed on its first attempt for a reason outside the code (the font provider returned a broken response to the
hosted runner; not reproducible locally). Restarting only the failed jobs is a one-line command, but the agent could not run it, and it could not wait for
the result either:

- `gh run rerun <id> --failed` is refused by the push guard with `DELIVERY-GH-UNCLASSIFIED` ("a gh command outside the read-only allowlist").
- `gh run watch <id> --exit-status` is refused the same way.
- A monitor with a polling loop over `gh run list` is refused by the lifecycle guard with `GUARD-PARSE-UNSUPPORTED` (loops are outside the closed shell grammar).

The agent therefore had to ask the PO to restart the run and to report its status. The PO's words: an agent should be allowed to restart a run.

## Cause (read from the code)

`lib/gh-cmd.mjs` classifies every `gh` invocation: only the subcommands in its read-only allowlist are `read-only`, the admitted delivery action is
`pr-create`, and every other shape is the fail-closed `DELIVERY-GH-UNCLASSIFIED`. `gh run` is not in the allowlist at all, neither its read subcommands
that block (`watch`) nor the one that changes nothing in the repository (`rerun`).

## What a rerun is

`gh run rerun <id> [--failed]` changes no code, no ref and no push state: it executes the workflow again for a commit that is already pushed. It still has an
effect outside the machine (it spends runner minutes and can re-trigger deployment jobs that a workflow attaches to a run), so it is not read-only.

## PO tile (decided 2026-11-01: option A, D230; PO word: into candidate 15c)

- A (recommended): a new closed class for `gh run rerun <numeric id> [--failed]` (exactly that shape, one run id, no other flag, no `--debug`), classified as
  its own action `ci-rerun` that the guard admits without a push approval, plus `gh run watch <numeric id> [--exit-status]` and `gh run view <id>` as
  read-only. Anything else under `gh run` (`cancel`, `delete`, `download`) stays unclassified. Protected kernel files: `lib/gh-cmd.mjs`, the push guard that
  wires it, their pins.
- B: only the read side (`gh run watch`, `gh run view`, `gh run list`) is admitted; a rerun stays a PO act.
- C: no change; the PO restarts and reports every time.

## Interim route in 0.7.0

The PO runs the rerun and reports the status in chat.
