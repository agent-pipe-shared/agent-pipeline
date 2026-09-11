---
name: reader-review
description: "Run a fresh two-stage reader review of user-facing documentation, resolve its findings, and bind the final reports to the committed document state. Use for documentation blocks and source release preparation; this is separate from technical Critic review and creates no PO gate."
---

# Reader review — documentation from the reader's position

This skill coordinates the reader-facing review defined by
`harness/reader-review-protocol.md`. It improves comprehensibility, order,
granularity and weighting. It does not review implementation correctness and
does not replace the Critic.

The review is an autonomous documentation-quality step. Starting it, resolving
its findings and recording its committed binding do not require a PO decision.
A later push, publication or release still uses its separately configured
gates.

## Choose the binding mode

When the repository contains the protocol and
`harness/scripts/check-doc-reader-binding.mjs`, use the source-bound procedure
below. The checker owns the exact document set and evidence schema; do not copy
its path list into this skill or silently add files.

In a consuming repository without that checker, review only the explicit
user-facing document paths supplied by its plan or documentation task. Preserve
both reports and the disposition under the project's normal evidence location,
but do not claim the Agent-Pipeline source binding, invent `record.json`, or
make release readiness depend on a contract that the project has not adopted.

## Source-bound procedure

1. Resolve `$ARGUMENTS` as a safe feature ID and optional full candidate commit.
   Default the candidate to the current clean `HEAD`. Refuse a dirty tree or a
   moving candidate. Run the checker's `--snapshot` mode and retain the exact
   committed paths and digests it returns.
2. Dispatch phase one as a fresh read-only subagent with no conversation
   history. Pass only the fixed candidate and the eleven document paths from
   the snapshot. Do not disclose source, diffs, history, capability inventory,
   governance, this protocol, earlier reports or desired conclusions. Request
   only cuts, reorderings and file/line findings, with no replacement prose.
3. Save the returned report unchanged at
   `specs/<feature-id>/evidence/reader-review/phase-one/<round>.md`.
4. Dispatch phase two as a different fresh read-only subagent. Pass the same
   candidate documents, the immutable phase-one report,
   `docs/product-capability-inventory.json`,
   `governance/observation-doc-governance.json`, and
   `harness/reader-review-protocol.md`. Request findings about weighting,
   order, granularity and comprehensibility. Keep it separate from technical
   Critic review.
5. Save phase two unchanged at the matching `phase-two/<round>.md`. Record every
   finding in `disposition/<round>.json` with the protocol's closed schema.
   Resolve applicable findings in the public documents. If any covered document
   changes, commit that state and restart both phases with a new round; reports
   from the previous document state cannot close the review.
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
