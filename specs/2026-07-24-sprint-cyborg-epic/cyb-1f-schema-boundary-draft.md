# CYB-1F — schema-boundary freeze (DRAFT, pre-gate)

> **Status: DRAFT / design-phase deepening. Not a freeze.** This document
> proposes the content of the CYB-1F schema-boundary checkpoint so that CYB-1
> can move quickly once the PO gate (EL-19) opens. The *actual* freeze remains
> the mid-CYB-1 PO checkpoint named in
> [`spec.md`](spec.md) §4 and PRD open decision B. Nothing here is ratified;
> it does not pre-empt PO decisions A–E.
>
> **Grounding:** every identifier below is derived from the issue requirements
> input — capability families verbatim from #44 "Capability families" (the
> thirteen numbered entries), catalog fields and result states verbatim from
> #41 §1/§2/§3. No taxonomy is invented; the slugs are the only added element,
> and they are the object of this draft.
>
> **Why CYB-1F is low-regret to draft now:** the capability-ID grammar, the
> thirteen family roots, the assurance-level enum and the control-result enum
> are required under every scope/slicing variant the PO may choose at the gate.
> They are the contract that CYB-2/#42, CYB-4/#43, CYB-6/#44, CYB-8/#47,
> CYB-3/CYB-7 and CYB-9/#48 all bind to (spec §2.1 spine).

## 1. What the freeze fixes (and what it deliberately leaves open)

The freeze fixes exactly the identifiers and closed enums that downstream
packages *reference by name* and therefore cannot be changed later without a
recorded cross-package re-approval (PRD hard stop 3):

1. the **capability-ID grammar** and the **thirteen capability family roots**
   (§3);
2. the **control-ID grammar** and its class vocabulary (§4);
3. the **assurance-level enum** (§5);
4. the **module registry** and its precedence rule (§6);
5. the **control-result enum** owned by the catalog schema (§7);
6. the **closed control-catalog schema field set** boundary (§8).

It deliberately does **not** fix: concrete control content, adapter
implementations, per-family sub-technique IDs, rule/config digests, or the
reference-catalog instance. Those are CYB-1 body work and later packages, and
they extend the frozen boundary additively.

## 2. Naming conventions

- Lowercase, dot-delimited segments; each segment `[a-z0-9]+(-[a-z0-9]+)*`.
- A namespace prefix names the artifact class: `cap.` capability, `ctl.`
  control, `mod.` module.
- Additive extension is non-breaking: a new `cap.<family>.<technique>` under an
  existing family root, or a new `ctl.…` under an existing class, does not
  reopen the freeze. Renaming, removing, or repurposing a frozen root does.

## 3. Capability-ID grammar and the thirteen family roots

Grammar: `cap.<family>` for a family root; `cap.<family>.<technique>` for an
additive sub-capability. The freeze covers only the **roots**; the thirteen
roots are closed at freeze, sub-techniques are additive (open decision F-1).

Adapters declare which roots they satisfy through the §2.3 `capabilities()`
export; the L2 capability plan (#42) and every catalog control's
"verifier capability requirement" field reference these roots. This is the
"#44 family registry" the spec §2.3 names.

| # (per #44) | Family root | Scope (verbatim intent from #44) |
| --- | --- | --- |
| 1 | `cap.secrets` | secret and credential exposure |
| 2 | `cap.sca` | dependency/SCA and malicious-package risk |
| 3 | `cap.sast` | static application security analysis |
| 4 | `cap.iac` | infrastructure-as-code and cloud configuration |
| 5 | `cap.container` | container/image and base-image integrity |
| 6 | `cap.ci-workflow` | CI/workflow and build-configuration hardening |
| 7 | `cap.dast` | API/DAST and protocol-negative testing |
| 8 | `cap.fuzz` | fuzz, property-based and parser-boundary testing |
| 9 | `cap.memsafety` | memory-safety/sanitizer checks where applicable |
| 10 | `cap.authz` | authentication, authorization and permission-boundary tests |
| 11 | `cap.crypto` | cryptography/TLS/configuration checks |
| 12 | `cap.privacy` | privacy/data-flow assertions where applicable |
| 13 | `cap.ai-agent` | AI/agent-specific tool, prompt-context, egress and authority checks |

The four existing v0.4.1 scanners map onto roots without inventing new ones:
gitleaks → `cap.secrets`; osv-scanner → `cap.sca`; semgrep → `cap.sast`;
license-check is a supply-chain/compliance control, not one of the thirteen
verification families — it stays a catalog control whose verifier is the
existing license adapter (flagged as open decision F-4: confirm license-check
is modelled as a control, not a fourteenth family).

The "where applicable" families (`cap.memsafety`, `cap.privacy`, and in
practice `cap.dast`/`cap.fuzz`) are **always registered** in the grammar;
their *applicability* is decided by the resolver (#41 §4), never by omitting
the root. Omitting a root would collapse `not-applicable` into silence, which
#41 design principle 3 forbids.

## 4. Control-ID grammar

Grammar: `ctl.<class>.<domain>.<slug>`, with a separate integer `revision` and
`status` field per #41 §1 (ID and revision are distinct fields, not encoded
together).

- `<class>` is a closed enum matching #41 §1 "universal, stack-specific or
  risk-specific class": `base | stack | risk`.
- `<domain>` is a slug validated against the module registry (§6) plus a small
  fixed set for cross-cutting base controls (e.g. `secrets`, `identity`).
- Examples grounded in #41/#44 intent: `ctl.base.secrets.no-committed-secrets`,
  `ctl.stack.container.nonroot-user`, `ctl.stack.ci-workflow.pinned-actions`,
  `ctl.risk.ai-agent.tool-authority-manifest`.

Supersession/migration metadata (#41 §1) uses `supersedes` / `superseded-by`
fields carrying full control IDs; a revision bump never silently reinterprets a
prior control (#41 AC "migration does not silently mark historical controls as
satisfied").

## 5. Assurance-level enum

Closed enum, exactly #41 §2: `baseline | elevated | critical`. Composable per
#41 (a level selects a control subset; modules add controls). Level is a policy
selection with upgrade/downgrade authority, rationale, expiry and requalify
trigger recorded through the governed decision path — those are catalog-body
fields, but the enum itself is frozen here because L1 policy resolution
(#42) and CYB-9 readiness reference it by value.

## 6. Module registry and precedence

Module IDs (from #41 §3 application/risk modules), always-registered roots:

`mod.web-api`, `mod.cli-lib`, `mod.container-deploy`, `mod.iac-cloud`,
`mod.native-desktop`, `mod.ai-agent`, `mod.secrets-identity`,
`mod.sensitive-data`, `mod.docs-only`.

A repository may activate several modules (#41 §3). Conflicts resolve by an
**explicit total precedence order**, never last-write-wins (#41 §3 + AC
"without ambiguous precedence"). Proposed order (most-specific / highest-risk
first), to be confirmed at the freeze — open decision F-2:

`mod.ai-agent > mod.sensitive-data > mod.secrets-identity > mod.iac-cloud >
mod.container-deploy > mod.web-api > mod.native-desktop > mod.cli-lib >
mod.docs-only`.

`mod.docs-only` is the valid `not-applicable` path for non-software
repositories (#41 §3) and is lowest precedence so any software signal
displaces it.

## 7. Control-result enum

Closed enum owned by the catalog schema, exactly #41 design principle 3 /
§1 result states: `met | not-met | not-applicable | unavailable | waived |
unknown | invalid`.

This is distinct from — and a subset of — the L3 per-capability *run* outcome
enum in spec §2.1 (`pass, findings, required-capability-missing, unsupported,
execution-unavailable, partial-coverage, stale, invalid, not-applicable,
waived`). The freeze fixes both and the mapping between them (open decision
F-3: ratify the run-outcome → control-result projection, e.g.
`required-capability-missing → not-met` under a required policy vs
`unavailable` under an optional one).

## 8. Closed control-catalog schema field boundary

The freeze fixes the **field set** (names + types + which are automation-
consumed vs informative), matching #41 §1. Downstream packages may read these
fields; free-form prose may explain but never replace them (#41 §1). Fields:

`id`, `revision`, `status`, `title`, `objective`, `threat`, `class`,
`applicability` (expression + required inputs), `phase`, `boundary`, `owner`,
`approvalAuthority`, `verifierType`, `capabilityRequirements` (list of `cap.*`
roots), `evidenceContract` (schema ref + freshness/binding rule), `severity`,
`defaultFailureMode`, `remediation`, `waiver` (authority/reason/expiry/
revalidationTrigger), `supersedes`/`supersededBy`, `standardMappings`
(informative, versioned — NIST SSDF / OWASP ASVS·SAMM·SCVS·AISVS / SLSA).

The evaluation **receipt** (#41 §5) is a separate schema
(`pipeline.control-catalog.v1` resolution → receipt) that references these
fields by digest and is discoverable through #22/ADR-0045; it is not a second
policy authority (#41 §5).

## 9. Downstream binding map (what each package consumes from the freeze)

| Package | Binds to |
| --- | --- |
| CYB-2 (#42) | `cap.*` roots (plan), control-result enum, catalog digest |
| CYB-6 (#44) | `cap.*` family registry via `capabilities()`; module IDs |
| CYB-4 (#43) | assurance-level enum + module IDs (applicability) |
| CYB-8 (#47) | `ctl.*` and `cap.*` IDs on finding records |
| CYB-3 / CYB-7 | `cap.sca`, `cap.container`; catalog controls for supply-chain |
| CYB-9 (#48) | assurance levels + evaluation receipt |
| CYB-5 (#46) | `ctl.*` grammar (§4) for its catalog-modelled controls (e.g. `ctl.risk.ai-agent.*`); the waiver-class fields (§8) for the "PO-waived direct implementation" L0 waiver type — per `spec.md` §4 ("CYB-5 … Depends: CYB-1 (module/control IDs)"), added here per the cross-spec consistency review's finding 1 (2026-07-25: this row was missing) |

## 10. Open decisions to resolve AT the freeze checkpoint

These are genuine forks I am **not** deciding unilaterally; they are the agenda
of the mid-CYB-1 PO checkpoint:

- **F-1:** freeze only the thirteen roots (sub-techniques additive), or also
  fix a first sub-technique set now? *Draft recommendation: roots only.*
- **F-2:** confirm the module precedence total order in §6. *Draft
  recommendation: as listed.*
- **F-3:** ratify the run-outcome → control-result projection (§7).
- **F-4:** confirm license-check is a catalog control, not a fourteenth
  capability family (§3).
- **F-5:** control-ID `<domain>` vocabulary — validate strictly against the
  module registry, or allow a small open base-domain set? *Draft
  recommendation: fixed class enum + module-validated domain + a short fixed
  base-domain list.*

## 11. Gate discipline

This draft changes no runtime artifact, registers no schema, and dispatches no
implementation (EL-19 respected). It is Elephant design-phase content that
turns into the real CYB-1F freeze only after: (a) the PO gate opens with
decisions A/B, and (b) the mid-CYB-1 checkpoint ratifies F-1…F-5 above.
