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

For any review mode, use a bounded **2+1 course**: a complete two-stage review,
a correction batch, a fresh two-stage re-review, and a second correction batch.
These are the two regular paired rounds. The second round may focus on the
corrections or be a complete review; disclose its actual scope honestly.
Every round receives the complete frozen document set and flags surrounding
regressions or inconsistent guidance it notices.

One optional third round must be a complete two-stage review. Before launching
either reader in that round, commit a justification after round two: exact
`afterRound: 2`, a nonblank reason of at most 500 characters, and a digest-bound
committed `source` with exactly `path` and `sha256`. Source publication must
precede the third reviewed state. Record that justification in terminal v2's
`escalation`; it is null for a two-round terminal course. This records the
documentation owner's existing authority and creates no new PO gate. Apply one
final correction batch after the third round. There are at most three paired
rounds and three correction batches: never launch a fourth review for a new
course, including by silently starting another course for the same findings.

Count a batch once even if it spans several commits. Preserve the same course
ID, round counts, batches, reviewed snapshots, report pairs and remaining
findings across edits, commits, restarts and evidence renaming. Deleting a
report or making an evidence-only commit does not reset the count. Distinct new
documentation scope may require a new course, but must retain outstanding
findings from the previous one. A clean round needing no further document edits
can close through the ordinary v1 binding, including a single clean round.

At the terminal batch, record the exact findings, their resolutions, and the
final committed document state. Completion requires every finding to be
resolved or explicitly accepted by the documentation owner; otherwise it
remains open and cannot yield a passing source binding. Do not add an
`openFindings` field to the closed terminal record or invent a final Reader
verdict. A terminal correction is editorially corrected, not freshly read.
Involve the PO only when existing authority rules require it.

Historically completed ordinary and terminal v1 bindings and their four-round
evidence remain valid under their unchanged contracts. Preserve their bytes,
schemas, counters and reports. An incomplete historical four-round record may
be completed only under its already-established historical decision and the
unchanged v1 requirements. Legacy compatibility supplies no permission to
launch a new fourth round. Determine that boundary from committed policy and
course evidence, never a caller-supplied legacy flag. Policy shortening or
schema conversion does not repair drift, provenance or finding gaps.

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
task. Preserve both reports, dispositions, counts and any prelaunch third-round
justification under the project's normal evidence location, but do not claim
the Agent-Pipeline source binding, invent `record.json`, or make release
readiness depend on a contract that the project has not adopted. Independently
owned files with the same protocol or checker basenames never select
source-bound mode.

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
   changes, commit that state; previous reports cannot supply ordinary unchanged-state
   closure for the edited state. Continue only within the same bounded course,
   preserving its counts and findings. Before a third paired round, commit its
   exact escalation justification after round two; the third must be complete.
   Stop after the final permitted correction batch. Never claim a passing
   source binding from a document state the checker cannot attest.
6. On a round needing no further public-document edits, commit the two
   reports and disposition. Derive the ordinary v1 `record.json` from a fresh
   checker snapshot, commit it last, and run the checker without `--snapshot`
   against that exact commit. Accept only `status: passed` with no findings.
7. For terminal correction after two or three paired rounds, use the source
   protocol's closed terminal v2 record. Preserve all report pairs and their
   publication provenance, bind every reviewed snapshot and correction batch,
   record each finding's exact resolution, existing owner acceptance, or a
   report-bound adjudication that its own phase-two report states, and
   bind the final committed state. Disclose normalized reports and any protocol
   transition. Derive the v2 owner record from existing policy or the actual
   course decision; do not invent an approval or ask the PO merely to finish
   this quality step. Commit the record last and require the checker to pass.
   Do not launch a fourth reader round or label the final correction freshly
   reviewed. Preserve historical terminal v1 evidence under its unchanged
   four-round contract, without granting new fourth-round permission.

The coordinator writes reports only after receiving them from the fresh
readers. Reader subagents remain read-only and never edit documentation,
evidence or Git state. A missing fresh-context dispatch capability is a typed
runtime limitation; a same-context self-review is not a substitute. The source
checker validates committed closure evidence; these coordination rules do not
claim that a shipped prelaunch controller mechanically prevents excess rounds.

## Release relationship

The Agent-Pipeline source release preflight already checks the committed reader
binding. It does not launch readers during release and must not create a review
loop after the candidate is frozen. Complete this skill before preparing that
release candidate. Any later change to covered documents, the capability
inventory, governance input or protocol invalidates the binding and requires
fresh review within the applicable course budget; drift never resets counts or
authorizes a fourth round.

For consumer projects, this skill remains available on Claude Code, Codex and
Antigravity through their native fresh-subagent facilities. It does not claim
that all runners expose identical host isolation, tool names or enforcement;
the reports must state the assurance actually observed by their host.
