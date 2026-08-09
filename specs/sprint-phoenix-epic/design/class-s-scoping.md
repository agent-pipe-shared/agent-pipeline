# Class S scoping — six seams between already-implemented packages

Written 2026-08-09, Elephant, direct code reads (no dispatch). This is design-only prep for a
future implementation wave: what each item actually needs, ordered by how well-scoped it already
is. None of this was built tonight — see `docs/state.md`'s "declined to force Class S" entry for
why attempting these unscoped, under Stop-hook pressure, at 400k+ tokens of context, was the
wrong call.

## A-AC-04 — smallest, best-scoped: needs a call site, not a new mechanism

**Clause:** "WHEN an agent asks for human authority, THE SYSTEM SHALL correlate the request to
the human ledger and SHALL NOT self-confirm it."

**What already exists:** `recordPipelineAttempt` (`external-command-offer.mjs:29`) takes an
injected `resolveHumanAuthority` resolver, calls it whenever `authorityRequirement ===
"human-decision-required"`, and fails closed (`ECO-AUTHORITY`) unless the resolver returns an
exact `{granted: true, decisionId, candidateDigest}` match. This is the correlation mechanism the
clause asks for, already tested in `external-command-offer.test.mjs`.

**What's missing:** zero production call sites. `grep -rln recordPipelineAttempt
plugins/pipeline-core/` returns only the function's own definition and its test file — nothing in
the actual dispatch/execution path calls it. The task is: find where an agent-initiated
destructive/guard-bypassing/authority-changing action is actually attempted in production code,
and route it through `recordPipelineAttempt` with `resolveHumanAuthority` bound to
`resolveHumanGovernanceAuthority` (`human-governance-ledger.mjs:48-65`). **This is a wiring task,
not a design task** — the interface shape is already fixed by the tested function signature.

## A-AC-05 — needs a schema decision, not just wiring

**Clause:** "WHEN runner, model, effort, profile, role, adapter, or capability identity is
recorded, THE SYSTEM SHALL include its provenance and assurance."

**Confirmed NO CARRIER** (`grep -n "runnerId\|modelId\|effort\|adapterId\|capabilityId"
agent-decision-journal.mjs` — zero hits): no event shape anywhere carries any of these seven named
identity fields. Before this is a wiring task, it's a schema-design task: what does "provenance"
mean for a model identity (a version string? a vendor attestation?), what does "assurance" mean
(a confidence score? a verification method?), and which event kinds need it — every agent-journal
event, or only ones where runner/model identity is actually material to the decision? That's a
real product decision, not something to infer from the code. Recommend: a short PRD-delta or
Spec-delta section answering this before any schema field lands, since `agent-decision-event.
schema.json` is depended on by every currently-passing agent-decision-journal test.

## E-AC-20 — needs the export package's own metadata shape settled first

**Clause:** "WHEN an audit bundle includes export metadata, THE SYSTEM SHALL include only policy/
profile digests and sanitized delivery evidence required by bundle policy and SHALL NOT treat
delivery as source authority."

**Confirmed NO CARRIER:** `audit-bundle.mjs`'s `planAuditBundle`/`buildAuditBundle` work over
`packs` (organization policy packs); nothing references any governance-export module. Blocked in
part by E-AC-02's own open gap (the export loss-declaration field always returns `[]`, found by
WP-E) — bundling "sanitized delivery evidence" cleanly depends on the export package's own digest/
loss-reporting being trustworthy first. Recommend sequencing this after E-AC-02, not before.

## H-AC-08 — needs an explicit "unverified legacy observation" event shape

**Clause:** "WHEN a legacy approval/override/deploy record cannot prove its original authority
tuple, THE SYSTEM SHALL import it only as an unverified observation that cannot satisfy a gate."

**Confirmed NO CARRIER** (checked, not just grepped): the one `legacy` hit in
`plan-spec-state-v2.mjs` is unrelated — it's Continuity-State's own v2 plan-schema migration
handling, not an import path for a legacy human-ledger record. No such import path exists
anywhere. This needs: (a) a defined source for what "a legacy approval/override/deploy record"
even is in this repo (pre-Phoenix approval history? an external system's record?) — genuinely
unclear without a PO answer — and (b) a new event kind or explicit `unverified: true` flag on
existing human-ledger events that a gate check can reject. Recommend treating the "what counts as
a legacy record" question as its own scoping question before any code.

## H-AC-09 — needs a design decision on physical-target binding

**Clause:** "WHEN cross-repository guarded work is authorized, THE SYSTEM SHALL bind evaluation,
token consumption, ledger placement, and target repository to one physical target and SHALL NOT
copy private coordinates into the coordinator repository."

**Confirmed scoped-too-narrow, not absent:** `external-push-ledger.mjs` (`appendExternalPushLedgerConsumption`,
`checkExternalPushLedgerConsumption`, `externalPushLedgerGate`) exists and is real, tested
machinery — but per its own module scope, it is single-repository push-proof binding, not
cross-repository guarded-work binding. Extending it needs a design decision about what "one
physical target" binding looks like when a coordinator repository authorizes work IN another
repository without ever holding that repository's private coordinates locally — a real
cross-repo trust-boundary design question, not a mechanical extension.

## X-AC-11 — smallest scope after A-AC-04, but crosses a package boundary

**Clause:** "WHEN organization policy governs a mandatory document class or external write, THE
SYSTEM SHALL consume the effective #9 policy and SHALL NOT create a parallel adapter authority."

**Confirmed NO CARRIER** (`grep -n "organizationPolicy\|organization-policy"
external-reference-adapter.mjs` — zero hits): the adapter package and the organization-policy
package (`organization-policy.mjs`) never reference each other at all. Needs: the adapter's write
path to call into `planOrganizationPolicyActivation`-family functions to check whether a target
document class is policy-mandatory before writing, rather than deciding independently. Smaller in
surface area than H-AC-08/H-AC-09 (no new event kind, no cross-repo trust question), but still
needs a design decision about the exact call shape between two packages that were built
independently and never designed to know about each other.

## Suggested order for a future session

1. **A-AC-04** — pure wiring, interface already fixed, lowest risk.
2. **X-AC-11** — one new call, no new schema, moderate design latitude.
3. **A-AC-05** — needs a schema-shape decision first (recommend as its own short design note).
4. **E-AC-20** — sequence after E-AC-02 closes (shared root cause).
5. **H-AC-09** — needs a cross-repo trust-boundary design decision.
6. **H-AC-08** — needs a PO answer to "what counts as a legacy record" before any code.
