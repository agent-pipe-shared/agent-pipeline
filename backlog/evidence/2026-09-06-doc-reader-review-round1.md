# Reader's review of the front-door documents (round 1)

Audience decided by the PO, not re-litigated here: **teams that carry audit
obligations, and people who want rails they can measure rather than rails
they are told about.** Not hobbyists, not people looking for a quick
scripting helper. This is a reader-experience review — weighting,
comprehensibility, order, granularity — not a technical correctness review.

## Scope and method

**Phase 1 (blind)** — read only, in this order, before writing any phase-1
answer: `README.md` lines 1–326 (stopped at the `DE-REFERENCE-BELOW` marker
on line 327), `SETUP.md` in full, `PIPELINE_FLOW.md` lines 1–238 (German
mirror begins at 239, not read), `docs/README.md` in full, `docs/overview.md`
in full, `docs/usage.md` in full. No source code, ADRs, backlog,
`docs/state.md`, CHANGELOG, or capability/USP files were opened during this
phase, and no phase-2 file was opened until the phase-1 answers below were
fixed.

**Phase 2 (weighting)** — only after phase 1 was written: `docs/`
`product-capability-inventory.json` (all 16 declared capabilities'
`id`/`publicName`/`problem`/`benefit`/top-level `status` fields; the large
per-capability `surfaceIds` arrays, mostly verify-suite-name lists, were
skipped as not relevant to a reader-prominence comparison),
`specs/sprint-nova-epic/design/2026-09-06-positioning-usp-catalog.md` in
full, and `plugins/pipeline-core/hooks/hooks.json`'s `hooks` object only
(from line 3; the long `$comment` on line 2 was skipped as instructed).

## What the documents told me

**What is this product?** A versioned operating model / governance layer for
agent-assisted software delivery: four roles (PO, Elephant, Goldfish,
Critic), deterministic gates before independent review, git guardrails,
model/token routing, and an evidence-over-claims discipline. Adopted by
reference (clone the pipeline repo, bind a plugin, calibrate per project)
rather than copied by hand.

**Who is it for?** The documents themselves do not commit to the PO's
narrower audience. README says "Teams building with coding agents" (line 66)
and, later, that the same method scales "from a weekend hack to an
enterprise codebase" (line 233), and its own cost callout explicitly invites
"a throwaway script or a same-day spike" (lines 49–50). Nothing in the six
phase-1 documents names an audit obligation, a compliance framework, or a
regulator as a reason to adopt. I could not, from these documents alone, tell
that this product is aimed specifically at audit-obligated teams rather than
at any team willing to pay the enforcement cost.

**What would it refuse to let me do?** This one is answerable: no
force-push, no history rewrite, no deleting protected branches, no skipped
hooks (README lines 92–94); pushes need recorded approval, `signature` by
default (`docs/usage.md` lines 36–44); generated runtime configuration must
not be hand-edited (`SETUP.md` lines 115–117, 127); `setup.mjs --force`
cannot bypass a V3 authority write (`SETUP.md` line 116); a consumer project
must not copy a root `setup.mjs` (README lines 124–125).

**What would I have to pay for that?** Only qualitatively answerable. Node.js
24+, git, and three external scanners (`SETUP.md` lines 19–21) are named
concretely. Beyond that, the documents repeat "tokens and speed" as the
trade (README lines 47–52; `SETUP.md` lines 34–41) without any number, time
estimate, or worked example — no session-length figure, no token-cost range,
no "a typical onboarding takes N minutes" claim anywhere in the six
documents. For an audience asked to weigh rigor against cost, this is a gap:
I could not answer "what would this cost me" beyond "more than doing
nothing."

**Gaps I could not fill from phase 1 alone:** the audience mismatch above;
what "Phoenix" and "Nova" actually are (never defined, only used); what
concrete evidence an auditor could be handed at the end of a delivery (no
phase-1 document names an artifact for this); how long onboarding takes.

## Findings

### R1 — The audience the PO named gets no audit-facing answer on the front door (weighting)

The string "audit" occurs in only two of the six phase-1 documents:
`docs/README.md` (the heading "Governance and audit evidence", line 46, and
the filename/link `audit-bundles.md`, line 48) and `SETUP.md` line 427,
where it appears only as the adjective "auditable" ("The bootstrap is the
auditable session entry") — a claim about the bootstrap step, not a pointer
to any artifact a reader could act on. It does not appear at all in
`README.md`, `PIPELINE_FLOW.md`, `docs/overview.md`, or `docs/usage.md`.
Nowhere across the six documents does "audit" name a reason to adopt the
product, or point a reader to a concrete artifact they could hand an
auditor. For the audience the PO named, the single most relevant question —
"what would I actually hand an auditor" — has no answer in the primary entry
points: only a two-line, easy-to-miss pointer in the documentation map
(`docs/README.md` lines 46–53), and one unexplained adjective in `SETUP.md`.
**Proposal:** name the audit/evidence-artifact story in `README.md`'s "What
you get" list (lines 73–105) and in `docs/overview.md`, not only as a link
title three clicks deep, and say what makes the bootstrap "auditable" the
first time `SETUP.md` uses that word.

### R2 — Release-status narrative occupies most of README before the value proposition lands (weighting)

`README.md` sandwiches its actual value proposition — "## The problem"
(64–71) and "## What you get" (73–105), 42 lines together — between two
blocks of procedural and architectural content that together run longer:
release status and approval-configuration nuance before it (lines 24–62:
"Current release: 0.6.2", Phoenix/Nova/Nova B, "Choose approval strength
honestly"), and internal source/plugin architecture plus two process
diagrams after it (lines 107–194: "Three roots", "How it works", "How a run
flows end to end"). Those two surrounding blocks add up to roughly 115
lines, more than the value-proposition sections they enclose, and none of
it is anywhere near "## Quick start" (line 253) — a reader deciding "is
this for me" meets architecture and release mechanics on both sides of the
actual pitch. The durable value proposition — what the product is, why it
exists, what you actually get — is real estate-poor next to what reads as
the most recently-touched content: a versioned release announcement.
**Proposal:** move the "Current release" callout (lines 24–45) down, past
"What you get", or trim it to a one-line pointer to a release-notes page;
let "The problem" / "What you get" occupy the top of the document.

### R3 — Undefined jargon in the first prominent callout (comprehensibility)

`README.md` lines 24–45 — the very first thing a reader sees after the
one-paragraph intro — uses "Phoenix", "Nova", "Nova B", "trust anchor" (line
33), and "structured-action contract" (line 36) with no definition anywhere
before or after in the document. A first-time reader cannot evaluate a claim
like "Nova remains active... Nova B remains future work" without already
knowing what Phoenix/Nova refer to, and nothing in the six phase-1 documents
ever states plainly that these are internal codenames for two development
strands rather than, say, product tiers or plug-ins the reader must choose
between.
**Proposal:** either cut this callout to a single release-line sentence with
a link, or add one clause defining Phoenix/Nova the first time either name
appears.

### R4 — The front door invites the audience the PO explicitly excluded (weighting / order)

`README.md` lines 47–52 ("a throwaway script or a same-day spike") and line
233 ("from a weekend hack to an enterprise codebase") explicitly welcome a
hobbyist/quick-script reader at two of the most prominent positions in the
document (the second callout, and a section header). The PO's decision
excludes exactly that reader. This isn't wrong as a technical statement (the
dials genuinely support light use), but at these positions it competes for
attention with the audit/enterprise framing the actual audience needs to see
first.
**Proposal:** keep the "dial it down" message, but move it out of the first
screen of callouts; let the top of the document address the audience that
was actually chosen.

### R5 — A narrow, host-specific troubleshooting note sits ahead of the setup flow (order / granularity)

`SETUP.md` lines 60–83, "Codex local agent activity troubleshooting" (one
runner's background-daemon health check), sits between "Runner support,
stated precisely" and "## A. Prepare your pipeline source" — i.e. before any
reader, regardless of runner, has done anything yet. It is troubleshooting
content for a problem that hasn't occurred, placed ahead of the first actual
setup step.
**Proposal:** move this block to a troubleshooting appendix or to
`docs/runtime-boundary.md`, leaving a one-line pointer in `SETUP.md`.

### R6 — An optional, off-by-default feature gets ten times the space of the mandatory guardrails it sits next to (granularity / weighting)

`SETUP.md` lines 128–157, "Choose advisor export consent explicitly", spends
~30 lines on internal consult-routing detail ("Fable → Opus → same-runner
consult order", "Sol transport", "network-open/read-only") for a feature
that is "optional at the repository boundary" and off by default (line
130–133). By contrast, the git guardrails that are the product's central,
always-on enforcement claim get three lines total, only in `README.md` (92–
94: "blocks force-pushes, history rewrites, deleted protected branches, and
skipped hooks") — `SETUP.md` never explains them at all.
**Proposal:** cut the Advisor internals to a link (they belong in a
dedicated Advisor doc); if space is freed up, spend it explaining what the
git guardrails actually check.

### R7 — "Quick start" is reachable only after ~250 lines (order)

`README.md`'s "## Quick start" and its command table are at line 253 of 326.
A reader following the "Newcomer path" callout (lines 20–22, "the only
required next document is SETUP.md") has no shortcut to "what do I actually
type" before scrolling past release status, architecture, and two mermaid
diagrams.
**Proposal:** move "## Quick start" up, directly after "## What you get"
(after line 105), ahead of "## How it works".

### R8 — The rare, one-time task is ordered ahead of the routine, repeated one (order)

`SETUP.md` states its own two jobs in order: (1) "prepare a copy of this
pipeline repository as your shared source", (2) "activate and calibrate the
pipeline in each repository that will use it" (lines 9–11). Section A (job
1, lines 85–195) is one-time, done once per organization by whoever
maintains the shared pipeline source. Section B (job 2, lines 197–455) is
what nearly every reader does, and does repeatedly, per project. Yet A comes
first and contains ~112 lines of V3-authority-migration internals (inspect →
plan → apply, transaction/rollback recovery, lines 91–195) that apply only
to an existing V0/V1/V2 authority — irrelevant to a first-time adopter, who
must read past all of it to reach Section B.
**Proposal:** move Section A after Section B, or split it into a separate
"maintaining the shared source" reference document linked from, not embedded
in, the main adoption path.

### R9 — A second, unmapped role vocabulary appears without warning (comprehensibility)

`SETUP.md` line 151 ("Fable → Opus → same-runner consult order") and
`README.md` lines 140–141 ("every duty assigned to Fable resolves to
`gpt-5.6-sol`") introduce "Fable" and "Sol" as if the reader already knows
them. Neither document ever maps these to the four roles README itself
defines at lines 79–84 (PO, Elephant, Goldfish, Critic). A reader who just
learned the role vocabulary hits a second, parallel vocabulary with no
bridge between the two.
**Proposal:** add one clause on first use: "Fable is Codex's name for the
[X] role" (or cut the name entirely and just say "the corresponding Codex
role").

### R10 — Two "what to read next" lists disagree with each other (order, minor)

`README.md`'s "## Learn more" (lines 294–308) orders: SETUP → overview →
usage → migration → design-decisions → operating-model. `docs/README.md`'s
"## User journey" (lines 13–24) orders: SETUP → usage → PIPELINE_FLOW →
v3-consumer-onboarding → runtime-boundary. Neither list mentions or defers
to the other, and `usage.md`'s position relative to `overview.md`/
`PIPELINE_FLOW.md` differs between them.
**Proposal:** pick one canonical "next documents" list and have the other
point to it rather than duplicate it.

## Weighting table

Comparison baseline: `docs/product-capability-inventory.json`'s 16 declared
capabilities (canonical, `criticReview.status: required-before-publication`)
and, where noted, the non-canonical
`specs/sprint-nova-epic/design/2026-09-06-positioning-usp-catalog.md` (design
input, its own header says "not canon"; status tags there are load-bearing
and are quoted, not upgraded).

| What | Weight for the stated audience | Current prominence in phase-1 front door | Direction |
|---|---|---|---|
| Audit/evidence artifacts (`audit-bundles.md`, `evidence-viewer.md` — USP catalog marks both "CLI"/shipped; **neither is one of the inventory's 16 declared capabilities**) | Highest — this is what the audience would hand an auditor | Near zero: one link each, `docs/README.md` only, word "audit" nowhere else | **Under-presented** (most severe) |
| Security-controls / NIST SSDF / OWASP ASVS mapping (USP catalog Pillar 4, marked "shipped"; also **not** one of the 16 declared capabilities, and no page for it appears in `docs/README.md`'s map at all) | High — direct compliance-framework mapping is exactly what an audit-obligated team looks for | Zero in the six phase-1 documents | **Under-presented** |
| Git/command guardrails and deterministic verify gate (`claude-hook-safety`, `deterministic-verification` — both `status: "shipped"` in the inventory) | Very high — this is the central enforcement claim the whole audience-fit rests on | Low: a 3-line bullet (README 92–94) and one command in a table (README 268); the suite scale (USP catalog: "~515 suites") is never quantified anywhere in the front door | Under-presented relative to its role |
| Four-role model (`human-accountability-roles`, `specialist-agent-roles` — shipped) | High — the organizing idea of the whole product | High — full "What you get" section plus two diagrams | Appropriately weighted |
| Release/version status narrative (Phoenix/Nova/Nova B — not itself one of the 16 declared capabilities; a framing layer over the release) | Low for a first-time evaluator | Very high — the first ~45 lines of `README.md`, repeated at the end of `PIPELINE_FLOW.md`, `docs/overview.md`, `docs/usage.md` | **Over-presented**, especially by position |
| Advisor / consult mechanism (folded into `v3-routed-duties`, shipped; itself optional and off by default) | Low-medium | High — ~30 dedicated lines with internal transport/routing names in `SETUP.md` | **Over-presented** relative to its optional, disabled-by-default status |
| V3 authority / pipeline-source migration mechanics (`setup-and-runtime-projection`, shipped) | Low for a project-adopting reader (relevant mainly to whoever maintains the shared source) | Very high — ~112 lines occupying `SETUP.md` Section A, positioned ahead of the per-project activation flow | **Over-presented** relative to how few first-time readers need it |

**Recent small things taking space from older large things, plainly:** the
0.6.2 release-status framing and the Advisor consult mechanism — both of
which read as the most recently elaborated content in this document set —
occupy the most prominent real estate (top of `README.md`, a dedicated
`SETUP.md` subsection) that would otherwise go to the two things that
actually carry the product's weight for this audience: the deterministic
enforcement chain (git guardrails + verify gate) and the audit/evidence
trail. Both of the latter are older, larger, and load-bearing per the
capability inventory and the USP catalog, and both are comparatively
starved of space and, in the audit/evidence case, of any mention at all.

## What I am not saying

- I am not saying any capability is broken, or that the USP catalog's
  LIVE/CLI/CONTRACT/BUILT-NOT-WIRED tags are wrong — that is a technical
  review and not mine to do. I used the catalog only to see what is declared
  and at what status, per the briefing's instruction.
- I am not recommending that `audit-bundle` or `evidence-viewer` be promoted
  to the front door "as the answer" for this audience. The USP catalog that
  describes them as shipped/CLI is explicitly non-canonical design input,
  and neither one is among the capability inventory's 16 declared,
  reviewed capabilities. My finding is narrower: the audience's central
  question has no visible answer in the reading path, not that a specific
  named feature must fill it. Deciding whether/how to surface these belongs
  to whoever owns doc canon.
- I did not read the German mirror content below any `DE-REFERENCE-BELOW`
  marker, in any document, and I am not making any claim about whether the
  same problems exist there.
- I considered "Bring your own architecture rules & guardrails" (README
  214–229), "Three dials, not one size fits all" (231–240), and "Why this
  holds up at enterprise scale" (242–251) as candidates for the same
  "ahead of Quick start" complaint as R7, and left them out of the numbered
  findings: they read as reasonable, load-bearing positioning rather than a
  clear inversion, and I did not want to pad the list with a marginal call.
- Where I describe the release-status and Advisor content as "the most
  recently elaborated" (weighting table, closing paragraph), that is an
  inference from internal evidence (an explicit 0.6.2 stamp, and phrasing
  that reads as a status snapshot) and from this session's own dispatch
  context naming a 0.6.2 documentation block as current work — not from a
  `git log`/`git blame` read I performed as part of this review. I am
  flagging it as the pattern the briefing asked me to hunt for, not as a
  verified authorship fact.
- I did not treat `docs/product-capability-inventory.json`'s own internal
  ordering (its 16 capabilities are alphabetical by `id`, not ranked by
  importance) as a finding, since that file is not one of the four
  reader-facing documents this review judges; it was read only as the
  phase-2 comparison baseline the briefing specified.
- "Could be clearer" statements were deliberately excluded; every finding
  above names a concrete audience cost (what a reader from the stated
  audience cannot do, or cannot find, as a result).

PO acceptance: open.
