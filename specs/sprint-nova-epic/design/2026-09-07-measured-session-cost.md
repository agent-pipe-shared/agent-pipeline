> **Captured 2026-09-07** from the Claude Code usage report of the session that
> produced the 0.6.2 local candidate, supplied by the PO. Account-specific
> fields — remaining limits, reset times, promotional offers — were
> deliberately not carried over.
>
> **PO ruling, same day: this figure is NOT publishable and is not input for
> the cost page.** It measures a self-application session on the Pipeline's own
> repository, not a user running the Pipeline on their product, and it is
> therefore not evidence for what adoption costs. Its only sanctioned use is
> internal: the metering item (D.6), where it is a first metered attribution
> and a baseline a second runner can be compared against.
>
> The distribution lines are the tool's own wording, and its own caveat
> applies: approximate, derived from local sessions on one machine, and each
> line an independent characteristic rather than a share of one breakdown.

# Measured cost of one self-application session — 2026-09-07

The first metered total for a complete block of work done *on this repository
under its own operating model*. Everything recorded about cost so far was
either a paired per-task figure from 2026-08-09 or a runner self-estimate.

Read the boundary in the header before using any figure below: this is an
internal operating measurement, not a statement about what adopting the
Pipeline costs, and it is not input for the user-facing cost page.

## What the session was

The Nova B working block that produced the 0.6.2 local candidate: the Codex
transport fixes and their two Critic rounds, the release-line documentation
corrections, three guard and lifecycle-state corrections with a failed and then
passed review round, four measurement dispatches, the reader's Critic round,
and roughly ninety commits. It spanned five calendar days with intermittent
work, not five days of continuous running.

## Totals

| | |
|---|---|
| Cost | $2,497.65 |
| API duration | 2 d 7 h 40 m |
| Wall-clock duration | 5 d 16 h 54 m |
| Lines added | 65,861 |
| Lines removed | 6,224 |

Wall clock is roughly 2.4× the API duration, so the session was idle or waiting
on a human for well over half its life. Line counts include generated
projections, evidence artifacts and vendored copies, so they are a poor proxy
for delivered product.

## By model

| Model | Input | Output | Cache read | Cache write | Cost |
|---|---|---|---|---|---|
| Opus 5 | 9.4 M | 4.7 M | 1.4 B | 34.1 M | $1,191.19 |
| Sonnet 5 | 3.3 M | 7.8 M | 3.7 B | 35.3 M | $928.87 |
| Fable 5.1 | 13.8 M | 1.4 M | 164.4 M | 1.5 M | $278.37 |
| Haiku 4.5 | 131.8 K | 447.1 K | 3.6 M | 77.2 M | $99.22 |

The two implementation and review tiers carry 85 % of the cost between them.
Cache read dominates every row by three orders of magnitude over fresh input —
1.4 billion and 3.7 billion tokens respectively — which is what makes a long
session affordable at all.

## Cache behaviour

338 requests on the main session, 98 % of input tokens served from cache, five
misses. The last miss is attributed to idling past the one-hour cache lifetime,
which re-cached 2.4 M tokens in one go. That is the concrete cost of a long
human pause inside an open session.

## Distribution — the part that answers an open question

The usage tool's own characterisation of the last 24 hours:

- 100 % of usage came from subagent-heavy sessions. Each dispatched subagent
  runs its own requests.
- 100 % came from sessions active for eight hours or more.
- 86 % was at more than 150 K of context.
- 13 % came from subagents of the deep implementation tier.
- **16 % came from the `pipeline-core` plugin itself** — its agents, skills and
  tool surface.

That last line matters beyond cost reporting. The open item
`2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance`
records that the administration-versus-product share exists only as runner
self-estimates ranging from 40 % to 90 %, and states that positioning on
"measurable rails" is not credible while the one adoption-deciding number is
unmeasured. This is the first metered figure for part of that share. It is not
the whole answer — the plugin's own share is not the same as the total
administrative overhead, which also includes dispatch bootstrap, review rounds
and gate runs — but it is a floor derived from measurement rather than from
recall.

## Why this must not go into user-facing documentation

The PO ruled on this the same day it was captured, and the reason is not
caution about a large number — it is that the number answers a different
question than a reader would take it for.

**It measures the wrong subject.** This is a self-application session: the
Pipeline governing work on the Pipeline's own repository, at the highest rigor
setting the model offers, on canon and guard code where every change carries an
independent review. A user adopting the Pipeline for their own product runs a
different shape of work entirely. Publishing this as "what it costs" would
answer "what does it cost to develop the Pipeline" while appearing to answer
"what does it cost to use the Pipeline".

**Most of what it paid for is not delivery.** Measurement dispatches whose only
output was a backlog entry. Two hypotheses tested and both discarded without a
line of production code changing. A review round that rejected our own change
and forced a rework. Two gate runs killed by a misfiring memory heuristic
before they finished. Those are real costs of this session and none of them is
a feature a user would receive.

**Its shape is atypical in every dimension the tool itself flags.** Five
calendar days at 2.4× wall clock over API time, permanently above 150 K of
context, entirely subagent-driven. The tool names all three as cost drivers;
this session maximises each.

What the reader-facing cost page needs instead is a per-task figure from a
consumer project, paired with and without the Pipeline, on work a reader
recognises. The 2026-08-09 paired measurement is closer to that shape and is
already recorded. This document is not a substitute for it and must not be
cited as one.

**Sanctioned use, in full:** the metering item's need for a metered rather than
self-estimated attribution, and a baseline for comparing a second runner. The
reader's Critic found that a reader cannot answer "what would this cost me"
from the front doors; that gap stays open, and this document does not close it.
