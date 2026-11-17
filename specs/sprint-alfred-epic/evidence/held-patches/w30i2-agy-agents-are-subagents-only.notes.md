# w30i2 — the Antigravity runner view marks every shipped Pipeline agent subagent-only (C30I-S1B)

Applies AFTER the 30h chain plus the skill split (clone fin3, base 3d09379293b6eeeea44e5fea23dec707ede3d632): the patch is the delta on that state and does not apply to the real checkout before it.
Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What

- `transformAgyRunnerAgent` (plugins/pipeline-core/lib/agy-central-snapshot.mjs), the single closed rewrite of `agents/*.md` for the runner view and the central snapshot, now also writes four lines
  just before the closing frontmatter line, in this order: `mainAgent: false`, `subagent: true`, `commandExecutionPolicy: sandbox`, `inheritCustomizations: true`.
  The last two pin today's runner defaults so a later default change cannot silently change what a role agent may execute or which hooks it inherits.
- Deterministic; the line ending of the closing line is reused (a CRLF file stays CRLF). A file without a frontmatter, or with an unclosed one, is returned unchanged (same Buffer), as before.
- A source frontmatter that already carries any of the four keys is refused `AGV-AGENT-KEY-CONFLICT` (style of `AGV-AGENT-MODEL-AMBIGUOUS`), so a later edit of an agent file is never silently overwritten.
- Idempotence: transforming the OUTPUT again is refused as a key conflict (the output carries the keys), by design: the view is never an input of the transform; the same source always gives the same bytes.
- Because every comparison of the managed copy with the approved source (`assertAgyRunnerViewMatchesSource`, view inventory, snapshot inventory, `public-core-observation`) goes through this one transform, the view digest and the plugin version label change in step; no other code knows the keys.
- Tests (plugins/pipeline-core/lib/pins/antigravity-global-refresh-recovers-and-installs-a-runner-view.test.mjs): four new cases (keys and order, all eight shipped agents with `model:`/`tools:` rewrites intact and Claude sources byte-unchanged, CRLF and no/unclosed frontmatter, conflict refusal and output re-transform).
  Seven existing byte assertions were restated for the four added lines only (QG-04); none weakened. Recorded RED against the original code (4 failures) before the production edit, then 40 of 40 green.
- One paragraph in skills/pipeline-start/references/antigravity-native-dispatch.md.

## Why

On runner 1.5.10 the installed `agy agents` lists only `consult-advisor` and `readiness-reviewer`, the two copies without a `model:` line. Most likely (UNPROVEN) an agent without a fixed model is offered as a main agent; a read-only role agent must never be selectable as the main session agent (that is the Elephant).

## Not changed

Claude and Codex paths, every agent definition, the model and tool tables, any dispatch guard. `inheritMcp` is deliberately not touched: whether a role agent should inherit the project's MCP servers is an OPEN PO question. `install-agy.test.mjs` pins no agent bytes and needed no change (31 tests, 30 pass, 0 fail; one test is neither passed nor failed in the runner summary, unchanged by this patch).

## Not proven

- A real `invoke_subagent` per role on runner 1.5.10 and whether `mainAgent: false` changes what `agy agents` lists: attended PO step. `agy plugin validate --strict` on the generated view is run by the Elephant afterwards; not run here.
- The Critic is suspended by the PO for candidates of this repository: verified by tests only, no independent review. Registry/inventory rebaseline was not run in the clone; the clone commit carries no trailers (commit-in takes a one-line message).
