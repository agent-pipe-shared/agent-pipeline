# AC-19 inherited ADR source — implementation contract

Status: PO chose full route A on 2026-09-27. The source contract and local
consumer are implemented and focused-tested. This is not an activated
organization decision, signature, independent-runner receipt, or AC PASS.

## Ownership and trust boundary

Issue #9 owns the provider-neutral organization/team source interface and its
validation. Alfred consumes only its validated output. The existing
`pipeline.organization-policy-pack.v1` document-class projection is not an ADR
feed, and its `humanDecisionId` alone is not proof of an ADR's authority.
No filename, directory, self-declared status, digest, or caller-supplied
`validated: true` may promote an inherited decision.

The source interface must bind each decision reference to a stable identity,
content digest, `organization` or `team` layer, explicitly mapped OKF module
applicability, authority class, freshness, supersession lineage and a verified
activation/authority reference. It returns only bounded references and typed
findings; it does not copy private organization ADR prose into the repository's
public projection. The project-owned trust anchor must be resolved outside the
candidate source. Missing or invalid authority remains unavailable.

## Required outcomes

- No configured inherited source: `org-source: none`; Pipeline and local project
  decisions remain usable without manufacturing an inherited decision.
- Configured mandatory source unavailable/stale/invalid: block the dependent
  decision. Configured optional guidance unavailable: report it, never claim
  consumption or PASS.
- Two incompatible active inherited references: typed conflict for the owning
  human layer; no last-write-wins precedence.
- A project ADR opposing a governed inherited default: ineffective without a
  verified, scoped human exception that retains the original reference.
- A valid advisory deviation: visible rationale and acknowledgement, not a
  hidden override. Superseded decisions remain historical, not active.
- Two fresh runner sessions: compare their complete validated effective
  projection, including inherited references, active exceptions, availability
  and source revision. A changed source or source status yields typed divergence
  or unresolved, not a false parity result.

## Integration order

1. Add the #9-owned closed source contract, physical/authority validation and
   negative tests before adding a consumer. Avoid changing the existing pack
   v1 interpretation in place.
2. Make Alfred's task-module projection compose the validated #9 output with
   local ADRs and detect conflicts/waivers. Keep v1 legacy ADR warnings.
3. Route the same projection through bootstrap and implementation-entry
   readback for each supported runner, then test a configured inherited source
   and source drift in two independent sessions. A no-source fixture is not
   evidence for this positive path.

No additional PO decision is needed for this direction. Any actual source
activation requiring a human signature is a later, exact-source ceremony;
none is inferred from this document.

The PO-bound source registry uses `architecture-inherited-sources.mjs`
`prepare`, attended `po-human-approval.mjs sign-intent`, then `apply`. Its
request binds the complete descriptor set and previous registry byte digest.
The private organization/team source itself must carry its own signature from
the separately pinned authority; the project PO registry signature cannot
substitute for it. No organization feed is configured in this repository, so
the current readback must say `none`, not `consumed`.
