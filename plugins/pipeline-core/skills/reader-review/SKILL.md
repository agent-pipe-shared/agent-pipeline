---
name: reader-review
description: "Run a fresh two-stage reader review of user-facing documentation, resolve its findings, and bind the final reports to the committed document state. Use for documentation blocks and source release preparation; this is separate from technical Critic review and creates no PO gate."
---

# Reader review — documentation from the reader's position

This skill coordinates a reader-facing review of comprehensibility, order,
granularity and weighting. It does not review implementation correctness and
does not replace the Critic.

The review is an autonomous documentation-quality step. Starting it, resolving
its findings and recording its committed binding do not require a PO decision.
A later push, publication or release still uses its separately configured
gates.

For any review mode, use a bounded **2+2 course**: an initial complete
two-stage review, a correction batch, a fresh two-stage re-review focused on
those corrections, a second correction batch, a second complete two-stage
review, a third correction batch, a fresh two-stage re-review focused on those
corrections, and one final correction batch for findings from that last review.
The fourth correction batch is terminal: after it, the course is complete
without a fifth reader dispatch. Count each batch once even if it spans several
commits. A re-review may focus its findings on changed passages, but must
receive the complete frozen document set and flag regressions or inconsistent
surrounding guidance it notices. Preserve rounds, batches, reviewed commits,
and remaining findings across sessions; a new round ID or evidence-only commit
does not reset the count. An earlier round with no findings completes the
course immediately. Do not retroactively invalidate a completed binding.

At the terminal batch, record the exact findings, their resolutions, and the
final committed document state. Do not launch another two-stage round or
silently start a new course for the same findings. Completion requires every
finding to be resolved or explicitly accepted by the documentation owner;
otherwise it remains open. Procedural completion does not by itself create a
passing source binding: never write `record.json` against a document state the
source checker cannot attest. Involve the PO only when existing authority
rules require it.

## Choose the binding mode

Confirm Agent-Pipeline source-checkout identity before selecting the
source-bound procedure. Require both `.claude/pipeline.json` and
`.claude-plugin/marketplace.json` to be tracked regular files at the Git root;
parse them as JSON and require the former's `project` to equal
`agent-pipeline`, the latter's `name` and `owner.name` to equal
`agent-pipeline`, and exactly one marketplace plugin named `pipeline-core`
whose source is `./plugins/pipeline-core`. Then resolve exactly one tracked file
named `reader-review-protocol.md` and exactly one tracked script named
`check-doc-reader-binding.mjs` with `git ls-files`. Use the source-bound
procedure only when every check passes. The checker owns the exact document set
and evidence schema; do not copy its path list into this skill or silently add
files.

In a repository that does not satisfy that complete identity check, review only
the explicit user-facing document paths supplied by its plan or documentation
task. Preserve both reports and the disposition under the project's normal
evidence location, but do not claim the Agent-Pipeline source binding, invent
`record.json`, or make release readiness depend on a contract that the project
has not adopted. Independently owned files with the same protocol or checker
basenames never select source-bound mode.

## Source-bound procedure

1. Resolve `$ARGUMENTS` as a safe feature ID and optional full candidate commit.
   Default the candidate to the current clean `HEAD`. Refuse a dirty tree or a
   moving candidate. Run the checker's `--snapshot` mode and retain the exact
   committed paths and digests it returns.
2. Dispatch phase one as a fresh read-only subagent with no conversation
   history. Pass only the fixed candidate and every document path returned by
   the checker's snapshot. Do not disclose source, diffs, history, capability inventory,
   governance, this protocol, earlier reports or desired conclusions. Request
   only cuts, reorderings and file/line findings, with no replacement prose.
3. Save the returned report unchanged at
   `specs/<feature-id>/evidence/reader-review/phase-one/<round>.md`.
4. Dispatch phase two as a different fresh read-only subagent. Pass the same
   candidate documents, the immutable phase-one report,
   `docs/product-capability-inventory.json`,
   `governance/observation-doc-governance.json`, and the source protocol
   resolved above. Request findings about weighting,
   order, granularity and comprehensibility. Keep it separate from technical
   Critic review.
5. Save phase two unchanged at the matching `phase-two/<round>.md`. Record every
   finding in `disposition/<round>.json` with the protocol's closed schema.
   Resolve applicable findings in the public documents. If any covered document
   changes, commit that state and restart both phases with a new round; reports
   from the previous document state cannot close the review. Apply the bounded
   course above; after its fourth review, resolve findings in one terminal
   correction batch and do not dispatch a fifth review. Never claim a passing
   source binding from a document state the checker cannot attest.
6. On the first round needing no further public-document edits, commit the two
   reports and disposition. Derive `record.json` from a fresh checker snapshot,
   commit it last, and run the checker without `--snapshot` against that exact
   commit. Accept only `status: passed` with no findings.

The coordinator writes reports only after receiving them from the fresh
readers. Reader subagents remain read-only and never edit documentation,
evidence or Git state. A missing fresh-context dispatch capability is a typed
runtime limitation; a same-context self-review is not a substitute.

## Release relationship

The Agent-Pipeline source release preflight already checks the committed reader
binding. It does not launch readers during release and must not create a review
loop after the candidate is frozen. Complete this skill before preparing that
release candidate. Any later change to covered documents, the capability
inventory, governance input or protocol invalidates the binding and requires a
new two-stage round.

For consumer projects, this skill remains available on Claude Code, Codex and
Antigravity through their native fresh-subagent facilities. It does not claim
that all runners expose identical host isolation, tool names or enforcement;
the reports must state the assurance actually observed by their host.
