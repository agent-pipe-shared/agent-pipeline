---
name: architecture-decision
description: Assess architecture decision significance, draft ADRs, identify inherited decisions, and validate decision continuity.
argument-hint: "[assess|draft|inherit|waiver|supersede|summary|validate] [args]"
---

# Architecture Decision Continuity (WP-D1 / Issue #99)

The Architecture Decision skill provides project-neutral, explicitly invokable
architecture continuity for the Agent-Pipeline. It implements the five deterministic
significance axes, the seven conflict semantics, decision record schema governance,
and the living decision summary.

## Non-goals and Authority Boundaries

- **No ADR for every implementation detail:** Routine code edits, localized refactors,
  internal helper changes, and test updates do not trigger an architectural decision.
- **Agent never approves its own decision or exception:** Agents propose ADRs and
  evidence; approval, adoption, and waivers are PO-performed via the existing
  signature-or-chat ceremony duality (`gates.push_approval`).
- **Prose is not a control:** Architectural decisions exist as versioned machine-readable
  records (`pipeline.architecture-decision.v1`) with bound SHA-256 digests.

---

## The 7 Skill Capabilities (§7.1)

### 1. Assess Significance (Rubric)
Evaluate whether planned or actual changes trigger any of the 5 deterministic significance axes:
1. **System structure or component boundaries:** Changes to component layout, exported module boundaries, inter-module dependency graph, public APIs, or architecture profiles.
2. **Runtime, framework, dependency, storage, or integration strategy:** Changes to language runtimes, package dependencies, storage persistence, database schemas/migrations, or integration adapters.
3. **Deployment and execution environment:** Changes to execution runners, host requirements, external adapters, container specifications, or CI/CD pipelines.
4. **Quality attributes:** Changes impacting security, privacy, reliability, portability, or performance policies and infrastructure.
5. **Choices that are costly, risky, or hard to reverse:** Public contract freezes, wire protocols, breaking schema migrations, licenses, or irreversible architectural commitments.

**Command:**
```bash
node plugins/pipeline-core/scripts/architecture-baseline.mjs --root "$PWD" [--diff <ref> | --from <sha> --through <sha>] [--format json|text]
```

**Outcomes:**
- `initial-adr-required`: One or more material axes fired and no baseline ADR exists in the repository.
- `architecture-baseline-sufficient`: Material axes fired and accepted baseline ADRs cover the architectural scope.
- `no-material-architecture-decision`: Changes are purely routine or localized implementation details.

### 2. Draft Concise ADR from Governed Evidence
When an architectural decision is required, draft a concise ADR in `docs/adr/`:
- Filename convention: `docs/adr/XXXX-<slug>.md` (e.g. `docs/adr/0064-storage-adapter-migration.md`).
- Companion sidecar JSON: `docs/adr/XXXX-<slug>.json` adhering to `pipeline.architecture-decision.v1`.
- Compute the SHA-256 digest of the markdown content and record it in `digest`.
- Include standard ADR sections: Title, Status, Date, Context, Decision, Consequences, and Affected Contracts.

### 3. Identify Applicable Inherited Decisions
Resolve effective architecture decisions through authority layering:
1. **Organization / Team Policies:** Consumed through #9 interface when configured (`id`, `digest`, `layer`, `applicability`, `authorityClass`, `freshness`). Unconfigured defaults to `org-source: none`.
2. **Pipeline Core:** Governed pipeline architecture and guardrails.
3. **Project Layer:** Repo-local ADRs in `docs/adr/`.

**Deterministic Conflict Semantics (all 7 Issue #99 §4 cases):**
1. Governed default without exception → follow default.
2. Explicit scoped exception → follow exception and preserve reference to original.
3. Incompatible inherited decisions → escalate to owning human layer, never pick one.
4. Project ADR against higher authority → rejected without a valid scoped exception.
5. Advisory deviation → allowed with named rationale where acknowledgement is required.
6. Unavailable optional guidance → typed and unsatisfied, never falsely consumed.
7. Unavailable mandatory source → blocks the dependent decision.

### 4. Propose Explicit Human Waiver for Needed Deviation
When a project requires a deliberate deviation from an inherited decision or rule:
- Propose an explicit human waiver record with `status: "waived"`.
- Populate `exception`:
  ```json
  {
    "authority": "human-po",
    "rationale": "Detailed explanation of technical necessity and alternative mitigation",
    "scope": "project",
    "expiry": "2026-12-31"
  }
  ```
- A waiver leaves the original authority intact.
- PO executes the waiver approval via signature-or-chat.

### 5. Supersede Rather than Rewrite
Architecture decisions are immutable history. When reversing or replacing a decision:
- Never overwrite or rewrite the previous ADR file.
- Mark the previous decision `status: "superseded"`.
- Create a new ADR with `status: "accepted"` and set `supersedes: "<previous-id>"`.
- Preserve the complete lineage and historical context.

### 6. Update Living Summary and References
To prevent context tax from loading the entire ADR estate at bootstrap, compile the
living summary into `project/architecture-decisions.compiled.json`:
```bash
node plugins/pipeline-core/scripts/architecture-baseline.mjs --root "$PWD" --compile-summary
```
The summary captures IDs, titles, status, scopes, and active exceptions, bounded in size.

### 7. Validate Status, Identity, Applicability, Supersession, and Traceability
Validate the entire decision estate:
- Every sidecar JSON matches schema `pipeline.architecture-decision.v1`.
- Digest in JSON matches the SHA-256 hash of the markdown ADR.
- All superseded IDs link to valid, existing ADR records.
- Active exceptions are unexpired and trace to explicit human authority.
- Token ADRs that do not match the implementation are flagged as semantic non-conformance.

---

## Close-Path Impact Reporting

Every lifecycle close reports exactly one typed architecture impact value:
- `architecture-conforms`
- `architecture-decision-added`
- `architecture-decision-superseded`
- `architecture-summary-updated`
- `no-architecture-impact`

Recorded via the existing close-ritual extension point (`ritualExtensions.close.pre`).
