# CYB-1 — control catalog + assurance authority (feature spec)

> **Status: IMPLEMENTATION COMPLETE.** Translates issue #41's problem statement and 14 acceptance
> criteria (fetched verbatim via `gh issue view 41`, 2026-07-25) into checkable
> form per `backlog-acceptance-matrix.md`'s own instruction. Builds on, and does
> not duplicate, [`cyb-1f-schema-boundary-draft.md`](cyb-1f-schema-boundary-draft.md)
> (the frozen identifiers/enums) and [`spec.md`](spec.md) §4's CYB-1 package
> summary. The implementation is delivered in the Cyborg candidate. Package root
> `specs/CYB-1/` per ADR-0045's canonical topology is deliberately NOT created
> here — that migration needs its own explicit lifecycle-approval decision
> (ADR-0045 "Migration" section), which is a separate foundational call this
> sketch does not make unilaterally overnight. This file follows the same
> in-epic-folder convention already used for CYB-1F.

## 1. Problem and outcome (from #41, condensed)

No single versioned catalog tells an adopting repository which secure-
development controls apply, how they're verified, what evidence proves them,
and when a missing control blocks. Outcome: a provider-neutral, versioned
**Secure Development Control Catalog** with composable assurance profiles
(`baseline | elevated | critical`), informatively mapped to NIST SSDF / OWASP
ASVS·SAMM·SCVS·AISVS / SLSA without claiming certification.

## 2. Scope carried by this package (from #41 §1-§7)

1. Versioned control schema — CYB-1F §8 already freezes the field set.
2. Assurance levels — CYB-1F §5 already freezes the enum; this package owns
   upgrade/downgrade authority, rationale, expiry, requalification-trigger
   workflow.
3. Application/risk modules — CYB-1F §6 already freezes the registry +
   precedence; this package owns module activation and conflict resolution
   at evaluation time.
4. Applicability resolver (L1, `security-policy-resolver.mjs`) — deterministic,
   inspectable, missing-input → `unknown` (never silent `not-applicable`),
   digest-bound output per exact candidate.
5. Control evaluation receipt — machine-readable, discoverable via #22,
   consumable by #5/#6/#9/Release without becoming a second policy authority.
6. Waiver and exception lifecycle — named authority, bounded scope, rationale,
   compensating controls, expiry; fails closed when expired/scope-mismatched;
   includes the **PO-waived-direct-implementation class** (§6 below).
7. Documentation/conformance — operator, developer, auditor views generated
   from or validated against the same catalog; 5 stack fixtures; reference
   catalog small enough to review/version/diff.

## 3. Acceptance criteria — checkable form

| # | #41 AC (paraphrased) | Checkable criterion for THIS package | Evidence class |
| --- | --- | --- | --- |
| AC1 | Closed, versioned schema for every control field/result state | Schema fixture validates a control with every CYB-1F §8 field present; a control missing a required field is rejected with a typed error, not silently accepted | Schema fixture suite |
| AC2 | Baseline/elevated/critical profiles deterministic and composable | Same input catalog + same assurance level → byte-identical resolved control set across 2 runs; level composition documented and tested (elevated ⊇ baseline) | Resolver determinism fixture |
| AC3 | Universal + stack/risk modules combine without ambiguous precedence | Fixture activates ≥2 conflicting modules; resolved precedence matches CYB-1F §6's total order exactly, never last-write-wins | Resolver precedence fixture |
| AC4 | Missing applicability input → `unknown`, never silent exemption | Fixture with an absent required input asserts result `unknown`, not `not-applicable` or omission from the control set | Negative-gate fixture |
| AC5 | Every applicable control names verifier + evidence contract + boundary + failure policy | Catalog-content lint: every control in the reference catalog has all four fields non-empty; missing any one fails catalog validation | Catalog lint suite |
| AC6 | Evaluation bound to exact candidate + effective policy digest | Receipt schema requires `candidateId` + `policyDigest`; two evaluations of different candidates against the same policy produce different receipt digests | Receipt binding fixture |
| AC7 | Waivers scoped/authorized/reasoned/time-bounded/non-destructive/revalidated | Fixture: expired waiver fails closed at protected boundary; waiver never mutates raw verifier evidence (assert original evidence bytes unchanged) | Waiver lifecycle fixture |
| AC8 | Standard mappings traceable/versioned, no certification claim | Every `standardMappings` entry carries a version; catalog-wide lint asserts no control or doc text uses the word "certified"/"compliant" without a qualifying disclaimer | Doc/catalog lint |
| AC9 | Fixtures cover web API, CLI/library, container/IaC, AI/agent, docs-only | 5 named fixture repositories/module-activation sets, one per `mod.*` cluster from CYB-1F §6, each producing a distinct resolved control set | 5 stack fixtures |
| AC10 | Repository can adopt baseline without irrelevant tooling | Baseline-only fixture activates zero optional modules; verify passes without invoking container/IaC/AI-agent-specific verifiers | Baseline-minimal fixture |
| AC11 | #5, #6, #9, Release/Promotion consume one normalized receipt | Single receipt schema (`pipeline.control-catalog.v1` resolution) documented as the sole consumption contract; no package defines a second parallel policy schema | Cross-consumer contract doc + fixture |
| AC12 | Operator/developer/auditor views generated from or validated against the same catalog | Each view is either generated from the catalog file directly, or has a validation check that fails if the view drifts from the catalog | View-consistency check |
| AC13 | Migration doesn't silently mark historical controls satisfied | Migration fixture: a pre-catalog repository with no receipt evaluates every control as `unknown`/`not-met`, never inherited `met` | Migration fixture |
| AC14 | Full Verify detects schema/precedence/applicability/evidence-binding drift | A new verify suite (registered per CYB-2's scoped-registration mechanism, `pipeline.verify-gate-scoped-registration`) fails when catalog schema, module precedence, or receipt binding is edited without a matching fixture update | Drift-detection verify suite |

Coverage note: this table maps 1:1 to `backlog-acceptance-matrix.md`'s "14"
count for #41; no AC is dropped or merged.

## 4. Waiver lifecycle — the PO-waived-direct-implementation class

Per spec.md §4's explicit call-out and the absorbed backlog item
[`pipeline.elephant-direct-implementation-under-afk-authorization`](../../backlog/items/2026-07-23-elephant-direct-implementation-under-afk-authorization.md)
(open, untriaged), CYB-1's waiver taxonomy must include a typed waiver class
for exactly the scenario that item describes: a PO pre-authorizes direct
Elephant implementation (no Goldfish dispatch) for a bounded block, most
often under AFK/time-boxed conditions where no live Critic review is
possible before push.

Checkable requirements for this waiver class specifically:

- **Typed, not prose-only:** the waiver record has a distinct `waiverClass:
  po-waived-direct-implementation` value, not a free-text note bolted onto a
  generic waiver.
- **Mandatory expiry:** the waiver is bounded to a named session/block, not
  open-ended; it cannot silently cover unrelated later work.
- **Mandatory follow-up:** accepting this waiver class automatically inserts
  a required fresh-context Critic review as the first gate-completing action
  of the next session — wired into the close ritual as a *requirement*, not
  a flag that can be silently missed (this is the exact gap the backlog item
  names: "the only options right now are the full dispatch/Critic ritual or a
  silent deviation later caught, if at all, by the close ritual's authorship
  check").
- **Self-clearing:** once the follow-up Critic review lands, the waiver
  record transitions to a closed/satisfied state with the Critic's evidence
  reference bound to it — an open waiver of this class remains a visible,
  queryable state, not something that decays into normal history.

**Tonight's own session is a clean instance of the alternative path**: the PO
authorized open-ended AFK continuation, and the correct response (per
advisor()) was to stay entirely in design-phase Elephant work and NOT invoke
this waiver class at all, since no production code was touched. That is
consistent with — and does not require — this waiver class existing yet. This
observation is recorded here as grounding, not as a triage decision on the
backlog item itself (triage remains the next session's Elephant, per
`backlog/README.md`).

## 5. Views (operator / developer / auditor)

Per #41 §7 and AC12: three generated-or-validated views over the same
catalog, not three independently maintained documents.

- **Operator guide** — selecting assurance level and modules for a new
  repository; decision-tree framing, not a field-by-field schema dump.
- **Developer view** — only the controls applicable to the current
  repository's resolved module set, with remediation guidance; this is the
  "no irrelevant tooling" view (AC10) made human-readable.
- **Auditor view** — full field set incl. standard mappings and evidence
  references, framed as traceability, not certification (AC8).

## 6. Non-goals (verbatim from #41)

Mandating every tool for every repo; treating one framework mapping as
certification; replacing project-specific threat modeling (that's CYB-4);
letting an agent lower assurance or self-approve a waiver; encoding
commercial product names into the core schema.

## 7. Dependencies

#22 (canonical artifact discovery), #40 (exact-candidate evidence foundation),
#27 (least-privilege workflow baseline), #39/CYB-3 (SBOM lifecycle, informs
the reference catalog's supply-chain controls). Per PRD/spec: completable from
the accepted Sentinel go-live base without unpublished Nightwing/Phoenix/Nova
commits.

## 8. Gate

The accepted Cyborg sprint plan authorizes normal implementation, focused
tests, Verify, Critic preparation and corrective work without per-step Human
authorization. The final package gate remains exact Verify + Security, a fresh
diff-scoped Critic, and the bound PO proof before push/release. A Human decision
is required only for that configured final gate or a genuine exception.
