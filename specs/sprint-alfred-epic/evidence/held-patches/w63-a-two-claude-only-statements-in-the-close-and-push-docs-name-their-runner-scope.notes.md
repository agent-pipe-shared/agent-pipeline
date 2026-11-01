# w63 — two Claude-only statements in the close and push docs name their runner scope (candidate 17)

Applies on the nine-patch chain; docs only.

## What went wrong

Two documents are read by agents on every runner but describe Claude Code only, without saying so:

- `close-feature/SKILL.md` Step 1 points `usage-ledger.mjs` at the Claude Code transcript directory. On Codex or Antigravity the reader has no source, and the step reads as a command to run.
- `docs/push-release-flow.md` Layer 5 describes the second gate (the host's own auto-mode classifier) as if it were universal.

## Change

- `close-feature` Step 1: the reader understands the Claude Code transcript layout only; on Codex or Antigravity skip the step, say in the close report that the telemetry row is unavailable
  for this runner, and neither point the command at another directory nor invent a row.
- `push-release-flow` Layer 5: a short "runner scope" paragraph before the classifier paragraphs: Codex and Antigravity have their own approval prompts and sandboxes which the document has not
  measured; a stop there is the runner's gate, not a Pipeline refusal; ask the PO instead of editing runner settings.
- Doc-contract suites pass (114 tests: push-release-flow contract, close-feature pin, doc contracts, section citations, push-approval pin).

## Not changed / not proven

- No behaviour changes. The statement about Codex and Antigravity prompts is deliberately a statement of what is not measured, not a description of their behaviour.
- Still open from the per-runner documentation list: the Layer 5 text itself, `workflow-dispatch.md`, `goldfish-task.md`, `critic-review` SKILL and `freshness.md` were read and not changed here; the runner
  mentions found there are either already scoped (`freshness.md` names the per-runner refresh boundary) or need a measured Codex/Antigravity fact that this repository does not have yet.
