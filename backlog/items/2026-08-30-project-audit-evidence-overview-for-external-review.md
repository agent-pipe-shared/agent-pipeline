---
schema: pipeline.backlog-item.v1
id: pipeline.project-audit-evidence-overview-for-external-review
type: requirement
owner: pipeline
status: open
created: 2026-08-30
sprint: nova-b
tracking: "Nova B — PO requirement from the 0.6.0 three-runner greenfield evaluation: a reviewer of an independently developed project must be able to locate the Pipeline's applicable controls, human gates, exceptions, and evidence without relying on an operator's private local knowledge."
source: "PO observation during the 0.6.0 greenfield evaluation, 2026-08-30. Direct inspection confirmed that durable project artifacts and private runtime ledgers are intentionally split across the tracked project tree and .git/agent-pipeline/, but no reviewer-facing map explains or links the split."
done_when: manual
---

# A project needs an audit-evidence overview that makes controls and exceptions discoverable

## What happened

The 0.6.0 greenfield projects contain the expected durable artifacts: the
onboarding spec package, `docs/state.md`, `project/pipeline-state.json`, the
critical-human-proof policy, and the push threat model. Their runtime records
also exist locally under `.git/agent-pipeline/`, including the human-guard
override audit chain, bootstrap observations, restart receipts, and hook
receipts.

Those two groups are intentionally separated, but the project offers no
reviewer-facing index explaining which evidence is versioned, which evidence
is private/local, how the two relate, and how a human gate or exceptional
authorization can be found. A reviewer cannot reasonably infer that structure
by browsing an unfamiliar project tree.

## Requirement

For a project built with Agent-Pipeline, a technical or DORA-style reviewer
must be able to discover the applicable controls and their evidence from the
repository without receiving private keys, raw prompts, local paths,
natural-person attribution, or unrestricted runtime logs.

The resulting view must make the following categories explicit:

- versioned project authority, active/closed feature state, specs, plan
  approvals, and threat-model references;
- verification and security evidence available for the reviewed candidate;
- configured human gates and the public-safe policy that defines them;
- the existence, purpose, integrity property, and local-only location class of
  private audit/override/restart records, without copying their sensitive
  payloads into Git;
- the public-safe record or explicit absence of exceptions, waivers, and
  special approvals;
- a clear distinction between a current control configuration, an observed
  runtime receipt, and a historical decision record.

## Direction to evaluate

Design and test a minimal, consumer-safe audit-evidence overview. It may be a
generated document, a machine-readable index with a readable renderer, or a
small stable project document. The form is deliberately not pre-selected.

The design must define freshness, redaction, candidate binding, and behavior
when local-only records are unavailable (for example in a fresh clone or a
remote review). It must not turn `.git/agent-pipeline/` into an agent scratch
area or publish raw audit logs merely to make them visible.

## Measured 2026-09-01: two gaps, not one

Re-checked live before any dispatch (item still `open`, one filing commit
`587b6f20`, nothing moved since). The measurement splits this item into two
gaps with different costs, and the second was not visible when it was filed.

**Gap A — the reviewer-facing map (this item, unchanged).** Nothing below
shrinks it. In particular `plugins/pipeline-core/scripts/audit-bundle.mjs`
does NOT already satisfy it: an Audit Bundle is per-Feature-Package,
create-only and candidate-bound — an assembly tool for one reviewed
candidate, not a "where does the evidence live, and which half is local-only"
map across a project.

**Gap B — the Phoenix governance layer that already exists is unreachable.**
The machinery was built and is documented, but no entry point names it.
`docs/README.md` is the documentation map, and its `Product and governance`
section lists the three threat models and the operating model only. Eight
documents classified `audience: public-user`, `lifecycle: maintained` in
`governance/observation-doc-governance.json` are named by that inventory and
by no navigable index: `audit-bundles.md`, `agent-decision-journal.md`,
`change-control.md`, `governance-event-export.md`, `governance-replay.md`,
`external-traceability.md`, `evidence-viewer.md`,
`organization-policy-packs.md`. Likewise `governance/` has no `README.md`,
so the hash-chained human-decision event log (`governance/events/human/`,
`heads.json`, `registry.json`, ADR-0071) and the twenty-one schemas beside it
are reachable only by already knowing they are there. The repository's own
`README.md` links `governance/examples/` — the advisory policy examples — and
nothing else under `governance/`.

Gap B is a wiring job with a fully determined shape and can close well before
Gap A's form is decided. Gap A carries a form decision that is the PO's
(generated document vs. machine-readable index with a renderer vs. a stable
project document — deliberately left open above) and an acceptance criterion
requiring a real greenfield run, so it cannot close in a session that has no
greenfield project in hand.

## Scope includes this repository

The requirement above says "a project built with Agent-Pipeline". Per
[ADR-0015](../../docs/adr/0015-self-application.md) that includes the Pipeline
repository itself, and the PO named it explicitly (2026-09-01: the governance
and audit trails are not findable "in einem User repo oder auch hier").
Recorded here because self-application makes it true but does not make it
discoverable to whoever picks this item up.

## Related work, not a duplicate

`2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md` concerns
the production and portable recording of specific GMW/HGO governance events.
This item concerns the independent review surface across all existing project
and local evidence; it does not assume that an event export, a ledger redesign,
or one particular renderer is the answer.

## Acceptance criteria

- A clean greenfield project has one documented entry point for audit evidence.
- A reviewer can locate each required category above and distinguish tracked
  evidence from local-only evidence without an operator explaining the layout.
- The overview is verified against at least one real Greenfield run and one
  clone/remote-review absence case.
- Tests prove that no secret, private key, raw prompt, personal attribution,
  home path, or raw local audit payload is emitted by the public-facing view.

## Triage

- **Decision:** accepted, Nova B
- **Rationale:** PO requirement; it improves auditability and product
  discoverability but does not invalidate the accepted 0.6.0 happy-path
  candidate.
- **Date:** 2026-08-30
