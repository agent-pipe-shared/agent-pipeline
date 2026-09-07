---
schema: pipeline.backlog-item.v1
id: pipeline.three-runners-showed-wide-pipeline-administration-overhead-variance
type: idea
owner: pipeline
status: open
created: 2026-08-29
sprint: nightwing
done_when: manual
source: "All three runners' own self-reports during the 2026-08-29 three-runner greenfield test (finding F31 of scratch/greenfield-triage-2026-08-29.md): Claude/Windows, Antigravity/WSL, Codex/WSL."
---

# Pipeline-administration overhead varies widely across runners, and the variance itself is more informative than any single number

## What happened

Each of the three runners in the 2026-08-29 greenfield test self-reported an
estimated split of its own effort between "pipeline administration"
(bootstrap, guard denials, ceremony) and actual product work:

- Claude (Windows): ~90% administration / 0% product.
- Codex (WSL): ~60–75% administration.
- Antigravity (WSL): ~40% administration, with a 16-minute end-to-end run.

**What this item does NOT claim**, per the source triage's own explicit
disclaimer: these percentages are the runners' own self-estimates, not
metered by any instrument in this repository or elsewhere. No token count,
wall-clock breakdown, or tool-call trace backs any of the three figures. The
finding worth acting on is the *spread itself* (90% vs. 40% for what is
nominally the same onboarding process) — a four-to-one-plus range on the
same pipeline is a stronger signal than any single runner's number, and it
says the overhead is not a fixed, inherent cost of the process but is highly
sensitive to something about the runner or the run.

## Where it is

Measurement/outcome finding — there is no code location to point at,
because nothing in this repository currently measures this at all. The
artifact that WOULD have to exist:

- A metered administration/product time-or-token split, captured per
  session, comparable to (but independent from) the cost telemetry already
  named in `policies/model-policy.md` (MP-20/MP-21, "cost telemetry,
  price-review follow-up" per `backlog/README.md`'s own References section).
  MP-20/MP-21 track cost; nothing found within this dispatch's reading
  tracks the administration-vs-product SHARE of a session's effort, which is
  the specific quantity this finding is about.
- The already-open, related item
  `backlog/items/2026-08-17-goldfish-critic-dispatch-bootstrap-token-cost-is-
  disproportionate.md` measures dispatch bootstrap cost specifically; this
  finding is broader (whole-session administration share, not just
  dispatch-bootstrap) and cross-runner (three different tools, not one).

## Proposal

This is explicitly deferred past the current sprint (`LATER` in the source
triage, mapped to `sprint: nightwing` per this dispatch's briefing) — it is
a measurement item, not an immediate fix. When picked up: instrument actual
per-session administration-vs-product time or token shares (not
self-estimated) across at least two runners, on the same or comparable
tasks, so the 90%/60–75%/40% range above can be checked against real
numbers rather than three unverified self-reports. Investigate what
Antigravity's run did differently to land at 40% and 16 minutes, since it is
both the best number and the one furthest from what the other two
independently reported.

## Acceptance

- A metering mechanism exists that reports administration-vs-product share
  for a session, sourced from actual tool-use/token counts rather than a
  self-estimate.
- At least two runners are compared on a metered (not self-reported) basis.
- The comparison names concrete candidate causes for the variance (e.g.
  bootstrap dispatch cost, guard-denial retry cycles, restart/continuity
  failures) rather than reporting the spread without an explanation
  attempt.
- Closure of this item is necessarily `manual` — there is no single code
  artifact whose presence proves the measurement was done well; a human (the
  PO or an Elephant) judges the resulting report.

## First metered figure, 2026-09-07 — a floor, not the answer

The PO supplied the Claude Code usage report for the session that produced the
0.6.2 local candidate. Persisted verbatim, minus account-specific fields, at
`specs/sprint-nova-epic/design/2026-09-07-measured-session-cost.md`.

One line in it is directly relevant here: **16 % of the usage is attributed to
the `pipeline-core` plugin itself** — its agents, skills and tool surface. A
further 13 % is attributed to the deep implementation tier's subagents. Those
are metered attributions from the tool, not self-estimates, which is exactly
the property this item says the 40–90 % spread lacks.

What this does and does not settle:

- It **does** give the first measured number for part of the administrative
  share, on one runner. The item's first acceptance criterion asked for exactly
  that shape of figure.
- It **does not** settle the share itself. The plugin's own attribution is
  narrower than administrative overhead: dispatch bootstrap payloads, review
  rounds, gate runs and guard-denial retries are administration too and are not
  inside that 16 %.
- It **does not** compare runners, which the second criterion requires. This is
  Claude only.

The session total is $2,497.65 over five calendar days, with 98 % of input
tokens served from cache and wall clock at 2.4× the API duration. Those figures
belong in the cost page (D.5) rather than here; what belongs here is that a
metered baseline now exists to compare a second runner against, which is the
cheapest remaining step toward closing this item.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment:** `sprint: nightwing` — deferred past this sprint, per the
  source triage's own `LATER (measurement item)` classification.
- **Date:**
