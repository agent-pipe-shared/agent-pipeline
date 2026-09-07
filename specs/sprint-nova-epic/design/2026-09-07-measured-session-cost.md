> **Captured 2026-09-07** from the Claude Code usage report of the session that
> produced the 0.6.2 local candidate, supplied by the PO for documentation use.
> Design input for the cost page (D.5) and the metering item (D.6), not canon.
> Account-specific fields — remaining limits, reset times, promotional offers —
> were deliberately not carried over; only the measured cost, volume and
> distribution facts are here. The distribution lines are the tool's own
> wording, and its own caveat applies: they are approximate, derived from local
> sessions on one machine, and each line is an independent characteristic
> rather than a share of one breakdown.

# Measured cost of one Pipeline session — 2026-09-07

The first hard number this repository has for what its own operating model
costs to run. Everything published about cost so far was either a paired
per-task figure from 2026-08-09 or a self-estimate; this is a metered total for
a complete piece of delivery work.

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

## What may and may not be claimed from this

May be published: the total, the model split, the cache ratio, and the
distribution lines with the tool's own caveat attached.

May **not** be published as-is: that this is representative. It is one session,
on one machine, on one runner, at an unusually high rigor setting, including a
review round that failed and had to be reworked. A second measurement on a
different shape of work is what would turn this from an anecdote into a range.

Also worth stating plainly wherever this appears: the figure includes work that
a reader would not call product — measurement dispatches whose only output was
a backlog entry, a review that rejected our own change, and two gate runs that
a misfiring memory heuristic killed before they finished.
