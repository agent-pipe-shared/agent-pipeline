# Observation intake governance

GitHub Issues are the repository-global, branch-independent single source of
truth for public observations from capture through triage and disposition. An
observation records directly seen behavior; it is not a confirmed bug,
root-cause claim, known error, or delivery commitment.

## Intake

Use the repository's **Observation or known-error candidate** Issue Form. It
applies only `kind:observation` and `triage:needs-review`; the required Area
field is evidence for triage, not an automatically trusted classification.
The `capture-observation` skill is the controlled automation path. It uses the
same headings and privacy boundary and may additionally apply the selected
`area:*` label after verifying that the repository owns all required labels.

Treat every issue body as public. Use `unknown` instead of guessing. Never
include secrets, private repository or network coordinates, personal or host
identity, home paths, raw logs, prompts, or chat transcripts. A possible
vulnerability, permission bypass, unintended write, secret exposure, or scope
escape goes to [private vulnerability reporting](../SECURITY.md), with no
public observation created.

### Queue and backlog validation

Before publication, the skill validates each candidate against the current
public observation queue in [`docs/state.md`](state.md) and the relevant
public backlog items, specs, ADRs, and governed documentation. The validation
record has one of three dispositions:

- **matching backlog item:** the observation is related to an existing delivery
  contract; the public GitHub blob link may be included in `sourceBacklogLinks`;
- **related but not equivalent:** an existing item provides context but does not
  own the observation; the issue must not imply that the backlog item confirms
  the behavior; or
- **no matching backlog item:** the issue remains a standalone observation and
  uses `None identified.` for source links.

The check must confirm that the queue entry exists, the actual/expected/
reproduction details are supported by public records or direct observation,
and every public source link resolves to the selected repository. Local paths,
private evidence, and unverified root-cause explanations stay in the local
validation context and are never copied into the issue. A missing queue entry,
unsupported detail, stale source link, or unresolved security disposition
blocks publication.

For a batch, prepare and display one canonical preview per candidate, including
its validation disposition and duplicate candidates. Publication requires an
explicit confirmation of that exact batch. Each issue is created separately
and read back separately; a partial batch must be reported as partial and never
presented as complete. The issue number/URL readback map can then be used for
later explicit triage or reciprocal backlog links.

## Lifecycle

`observation` → `triage` → `confirmed` → optional `known-error` → `backlog-link`

1. **Observation:** keep `kind:observation` and `triage:needs-review`. Search
   open and closed issues for duplicates; never silently merge or relabel.
2. **Triage:** verify public-safe evidence, reproduction, affected area, and
   the observed Runner, OS, Plugin/Pipeline versions, candidate, and capability
   status. Configuration or route selection does not prove runtime capability.
3. **Confirmed:** record the evidence-backed disposition in the same Issue.
   Confirmation means the behavior is reproducible or otherwise supported; it
   does not imply a root cause or implementation commitment.
4. **Known error:** classify a confirmed, unresolved product behavior as a
   known error only when its impact and any safe workaround are documented.
   Curated release-facing summaries may link from `docs/known-issues.md`, but
   they do not replace the Issue.
5. **Backlog link:** when maintainers accept implementation work, create or
   select one backlog item and link Issue and backlog item in both directions.
   The Issue remains the observation and triage authority; the backlog item
   owns priority, scope, assignment, and delivery status. Promotion is never
   automatic. Make the triage/promotion decision against a stable Public
   branch; branch-local evidence may support the decision but cannot replace
   the repository-global Issue.

Rejected, deferred, or duplicate dispositions also remain on the canonical
Issue with rationale. The sanitized error register may consolidate a recurring
class, but it is neither an event log nor an alternate observation record.
A private overlay keeps only its private deltas and links to the Public Issue
or backlog item; it does not copy or replace the Public observation.

### Documentation observations

Keep an `area:docs` report unconfirmed until triage inventories the complete
relevant `docs/` surface, not only the examples named by the reporter. Classify
each file on two independent closed axes: audience is `public-user`,
`maintainer`, or `machine`; lifecycle is `maintained`, `normative-record`,
`compatibility-redirect`, or `review-candidate`. Check every inbound link, the
current V3 authority, and any retention, redirect, migration, or scheduled
removal lifecycle before proposing deletion. Redirect stubs, ADRs, and
maintainer maps are not obsolete merely because they are short or superseded
for readers. Record the evidence and final disposition on the Issue.

The current branch's unconfirmed documentation observation has this
provisional scope; none of these entries authorizes relocation or deletion:

| File | Audience / lifecycle | Later review |
| --- | --- | --- |
| `codex-isolated-critic-foundation.md` | `maintainer` / `review-candidate` evidence snapshot | Consider archive or relocation. |
| `critic-isolation-threat-model.md` | `maintainer` / `maintained` public security contract, not a user front door | Keep; optionally group under a future `docs/security/` structure. |
| `design-decisions.md` | `public-user` / `review-candidate`; duplicates ADR/Operating Model material and needs V3 terminology review | Review merge only after inbound-link and authority checks. |
| `known-issues.md` | `maintainer` / `review-candidate`; currently branch/rollback handover material, not canonical known-error authority | Review split or relocation; GitHub Issues remain canonical. |
| `marketplace-supply-chain-threat-model.md` | `maintainer` / `maintained`; linked from ADR-0001 | Keep. |
| `product-capability-inventory.json` | `machine` / `maintained` governance evidence | Keep machine-readable; its tooling-owned path may remain. |
| `runtime-boundary.md` | `public-user` / `maintained` | Keep and refresh its Codex and legacy-redirect descriptions. |

The closed axes and complete file assignment live in
[`governance/observation-doc-governance.json`](../governance/observation-doc-governance.json).
ADR-0042 is the durable decision authority; this document is its maintained
operational explanation.
