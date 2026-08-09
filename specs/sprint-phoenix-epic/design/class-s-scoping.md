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

### CORRECTED 2026-08-09 (Elephant, direct code read): a second, real carrier exists — `guard-git.mjs`'s Phoenix override path

The paragraph above checked exactly one candidate carrier (`external-command-offer.mjs`) and
concluded "NO CARRIER" for the whole criterion from that single negative. It missed a second,
independent, already-production-wired mechanism: `guard-git.mjs`'s `consumePhoenixOverrideAuthority`
(`plugins/pipeline-core/hooks/guard-git.mjs:697-728`). When an agent's git command is blocked by a
guard rule and the agent supplies a `PIPELINE_GUARD_OVERRIDE` reference, the guard spawns
`governance-authority.mjs` to correlate the referenced `decisionId` against the real human ledger
(`human-governance-ledger.mjs`'s `resolveHumanGovernanceAuthority`/`queryHumanGovernanceDecisions`),
checks the decision's scope binds this exact repository fingerprint, candidate commit+tree,
`OVERRIDE.<rule>` action, and the guard file's own sha256, then **consumes** the grant so it cannot
be replayed. `guard-git-phoenix.test.mjs`'s one integration test proves the full chain live: no
reference → refused ("closed Phoenix authority reference is required"); a genuine ledger grant →
one-time allowed; the identical command replayed a second time → refused. Independently re-run in
this session: 1/1 pass. **This is the clause's "correlate to the ledger, do not self-confirm" half,
proven end-to-end, not absent.**

What remains genuinely missing, traced to the exact three functions involved: **there is no
production entry point that ever creates a "granted" human-governance-decision in the first
place.** `appendHumanGovernanceDecision` (`human-governance-ledger.mjs:150`) and
`createExternalHumanGovernanceIntent` (`human-governance-ledger.mjs:73`, the function that builds
a signable PO-approval intent from a decision) are each called only from test files — confirmed by
`grep -rln` over every `scripts/*.mjs` and `lib/*.mjs` — and `governance-authority.mjs`'s own CLI
only ever calls `appendConsumedHumanGovernanceDecision` (marking an existing grant used), never the
function that creates one. In today's live repository, a PO has no CLI to actually grant an agent
this authority; the test manufactures the grant by calling the library function directly, which is
legitimate for a test but is not a production path. `verifyExternalHumanGovernanceProof`
(`human-governance-ledger.mjs:101`) — the function that would make such a grant genuinely
non-self-confirmable, checked against the same `local-po-key` trust anchor already pinned at
`project/critical-human-proof.json` (`trustAnchor.publicKeySha256`) — is built and unit-tested but,
like the other two, has no caller outside tests either.

**This is now a small, precisely wiring task, not a design task**: chain three already-tested,
already-correct library functions behind a CLI, mirroring the exact prepare→external-sign→install
shape `guard-maintenance-window.mjs` already uses successfully in this repo (the same shape this
session used twice tonight for TP-3/TP-5 windows). No new schema, no new cryptography, no new
trust model — the trust anchor, the intent/proof shapes, and the ledger's own validation are all
already built and independently tested. Given the sensitivity of authority-granting code, this
should get an independent Critic pass on top of the usual break-proof self-verification before
being counted `implemented`, not merely self-verified re-run.

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

### RESOLVED 2026-08-09: PO answered the schema-design question, PHX-WP-AAC05 built it

PO disposition: "only where identity-relevant." Read against the taxonomy already documented in
`docs/agent-decision-journal.md` (`selection`/`escalation`/`fallback`/`assumption`/
`verification-scope`), that answers both open sub-questions at once — provenance/assurance meaning
stayed exactly what the Critic template's own report-header contract already used informally
(where the identity value came from; how confident/verified it is), and the "which kinds" question
resolved to the three kinds whose own semantics are about choosing or changing something:
`selection`, `escalation`, `fallback`. `assumption`/`verification-scope` never carry it. Built and
independently re-verified (29/29 tests, commit `8244ab3`): an optional `identity` array, closed
dimension/value/provenance/assurance shape, schema/validator drift-tested. Stays `partial`,
reclassified Class S to Class B — the mechanism is real, but a repo-wide search confirmed no
production code path anywhere emits a `selection`/`escalation`/`fallback` event at all yet, so the
identity capability, however correct, is never actually exercised.

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

### RESOLVED 2026-08-09: the "what counts as a legacy record" question was already answered, just not here

This section framed "what counts as a legacy approval/override/deploy record" as needing a fresh
PO answer. It didn't: the criterion's own source issue (#30, "Add a repository-scoped
tamper-evident human governance decision ledger") already names six exact classes in its own
Migration section -- mutable approval state, guard-override JSONL records, deployment approvals
and deploy logs, specialized override receipts, backlog transition records, and release/change
evidence -- and this repo's own, more current `spec.md` section 10 "Migration and compatibility"
independently confirms the shape (classify each record as provable decision, unverified
observation, duplicate projection, or unsupported; "legacy records that cannot be proven must be
imported, if at all, as explicitly unverified observations"). Neither the issue nor the Spec
needed re-deriving from a PO conversation; they needed reading. Built (PHX-WP-HAC08, commit
`a657e14`): a third, independent journal event kind, `legacy-import-observation` (dispatched like
`command-offer`, not folded into the 5-kind observational shape), closing exactly the "unverified
observation" outcome of the Spec's four-way classification. Stays `partial`, reclassified Class S
to Class B: a repo-wide search confirmed no production caller imports/migrates a legacy record
yet -- the mechanism is real, nothing exercises it in production.

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

### RECLASSIFIED 2026-08-09 (PO-confirmed): Class S -> Class P, not a design task to scope

The paragraph above framed this as a scoping question — what does "one physical target" binding
look like. It missed that the clause's own subject already answers a prior question: it is about
authorizing guarded work *in another repository*, and this repo's own governing rule, CLAUDE.md's
Sprint-0 hard rule, currently forbids that outright: "Read-only toward the three project repos
(<PROJECT_A>, <PROJECT_B>, <PROJECT_C>) for the duration of Sprint 0: `git fetch/pull/clone` and
reading only, never a write — until an explicitly approved Phase-4 migration changes this per
project." Designing a cross-repository binding mechanism for a write capability this repo is not
yet authorized to exercise is not scoping ahead of implementation — it is building for a capability
Sprint-0 policy has not yet unlocked, the same category error a design would be making if it
speculatively designed around a not-yet-approved future permission. This closes only if/when a
Phase-4 migration lifts the restriction for the target project, or the PO narrows the clause's own
scope by amendment (the route H-AC-11 already used for its own unsatisfiable half) — neither is a
code task available in this session. Reclassified Class S to Class P in
`evidence/acceptance-evidence-map.mjs`'s CLOSURE map; not pursued further this session.

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

1. **E-AC-20** — sequence after E-AC-02 closes (shared root cause).
2. **H-AC-08** — needs a PO answer to "what counts as a legacy record" before any code.

**A-AC-04** and **X-AC-11** dropped from this order — both built and closed earlier in this
session. **A-AC-05** dropped 2026-08-09: PO answered the scope question ("only where
identity-relevant"), built (PHX-WP-AAC05), see its own section above. **H-AC-09** dropped
2026-08-09: reclassified Class P (not closeable by writing code under Sprint-0 policy), see its
own section above.
