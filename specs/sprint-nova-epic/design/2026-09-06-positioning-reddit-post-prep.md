# Reddit post prep — first public feedback round

Prepared 2026-09-10 for the 0.6.2 candidate. This is editorial copy, not a
release or publication approval. The candidate is still pending; the local
checkout uses a 0.6.1 base with a distinct build suffix. Keep the publication
decision separate from this draft.

## Main post draft

**Title:** I’m building a workflow for AI coding agents that records approvals and checks — looking for first-contact feedback

I’m building Agent-Pipeline for teams that need to explain what an agent did,
what was approved, and which exact project state was checked. It is also for
people who prefer measurable rails to instructions that a busy model can simply
ignore. If you are making a small weekend project and do not need that record,
this may feel like overhead.

The central idea is simple: configured integrations for Claude Code, Codex, and
Antigravity can stop commands and file changes that violate project rules. What
is covered depends on the runner and setup; the [runtime boundary](../../../docs/runtime-boundary.md)
has the practical details and limits.

The second idea is traceability. Evidence is tied to an exact commit and tree,
and the workflow keeps records for checks, handovers, reviews, and approvals.
The point is to make “done” something another person can inspect rather than a
summary supplied by the agent. The repository also records where a control is
advisory, runner-bounded, or still being wired.

That comes with friction. A guard can reject a convenient one-line
command, and a first setup can stop for project-specific input. The project’s
measurements are historical repository measurements, not a promise about your
host or workload. The [cost and measurement notes](../../../docs/cost-and-measurement.md)
show what has and has not been measured; I am trying to reduce the
administration cost while keeping the evidence honest.

This is a source-available project under SUL-1.0 with the project’s additional
permission; it is not presented as OSI Open Source. The governing [license
notes](../../../docs/licensing.md) explain the boundary without offering legal
advice.

If you want to try it, use a disposable project and the supported onboarding
path in [SETUP](../../../SETUP.md). Give the first contact ten minutes. You do
not need to finish setup within that time. Note
where the runner asks for input, what it refuses, and whether the explanation
helps you decide what to do next. Stop if the setup would touch real work.

I would especially like answers to three questions:

1. What was the first refusal or pause that was unclear or unjustified?
2. Did the evidence and approval model help you understand what happened?
3. Which part of the setup or enforcement cost would prevent you using it?

## Short runner-specific openings

**Claude Code:** If you use Claude Code and want important workflow rules to
be enforced while the agent works, I’m looking for a few first-contact tests
of Agent-Pipeline. Start with the runner setup in [SETUP](../../../SETUP.md);
the [runtime boundary](../../../docs/runtime-boundary.md) describes the limits.

**Codex:** If you use Codex and want project rules to stop risky commands or
file changes, I’m looking for feedback on Agent-Pipeline’s first-contact flow.
Use the Codex setup path in [SETUP](../../../SETUP.md) and report where it
helps or gets in your way.

**Antigravity:** If you use Antigravity and want project rules checked while
the agent works, I’m looking for a bounded
first-contact test. Start with [SETUP](../../../SETUP.md); the [runtime
boundary](../../../docs/runtime-boundary.md) describes the limits.

## Ten-minute first-contact test

1. Pick an empty disposable project, separate from the pipeline checkout and
   any live project. Read the runner-specific setup prerequisites in [SETUP](../../../SETUP.md).
2. Start a ten-minute timer and use the documented onboarding path for your
   runner. If it stops, record the reason rather than disabling the control.
3. Try one harmless request that would create a small project file, such as a
   minimal `index.html` containing a heading. Record the first question,
   refusal, or successful handoff and its explanation.
4. Stop at ten minutes or at a request for information you do not want to
   provide. Report the result as “completed,” “paused for input,” or “blocked,”
   with the runner and host context you are comfortable sharing.
5. If you share feedback, use a minimal sanitized format: runner/version,
   elapsed time, reached step, expected behavior, observed behavior. Leave out
   private logs, project content, paths, and credentials.

## Internal pre-publication checklist

- Confirm the candidate/publication state separately; do not call the pending
  candidate a release or imply that a tag exists.
- Recheck current runner documentation and subreddit rules immediately before
  posting; this draft intentionally makes no flair or moderation claim.
- Keep claims about blocking scoped to the documented runner adapter and its
  recognized tool path. Do not turn one happy-path test into universal proof.
- Remove unsupported anecdotes, counts, prices, release claims, testimonials,
  and installation commands before publication.
- Before publication, replace local relative links with tested public links to
  the repository (`https://github.com/agent-pipe-shared/agent-pipeline`) and
  its candidate-bound `SETUP`, runtime-boundary, cost, and licensing pages;
  preserve the SUL-1.0 description without legal advice. Do not invent a
  current release ref.
- Keep feedback to the three questions above and do not ask readers to test on
  production projects or bypass a refusal.

## Dated research retained for editorial context

The 2026-09-06 positioning session recorded historical self-estimates from a
three-runner greenfield exercise and separately recorded older paired cost and
wall-clock observations. The runner self-estimates were not metered consumer
measurements and are deliberately omitted from the public copy. The same
session recorded historical Verify timing and administration friction; [cost
and measurement](../../../docs/cost-and-measurement.md) states the limits of
those receipts. Do not present any of these as current runner performance,
universal enforcement, or a release result.

The earlier draft’s subreddit advice, installation snippets, project counts,
personal anecdotes, and `[KORRIGIERE MICH]` placeholders are retired;
dated snapshot counts are retained only as historical research if needed.
Any current rules check, candidate gate, or publication decision belongs in the
pre-publication review, not in this historical design note.
