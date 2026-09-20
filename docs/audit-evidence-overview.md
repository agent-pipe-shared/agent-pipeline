# Project Audit and Evidence Overview

This document provides a technical and compliance reviewer (e.g. for DORA, SOC 2, or internal audit) with a structured index of the controls, evidence artifacts, human gates, and exception paths in an Agent-Pipeline project.

It establishes an explicit boundary between **versioned repository authority** (tracked in Git) and **private, machine-local runtime ledgers** (stored in `.git/agent-pipeline/`), ensuring reviewability without disclosing private keys, developer paths, or raw execution transcripts.

---

## 1. Control Architecture & Artifact Topology

Agent-Pipeline enforces a separation between three distinct layers:
1. **Control Configuration (Policy):** Versioned, human-reviewed specifications, gate manifests, and threat models.
2. **Runtime Receipts (Observed Evidence):** Candidate-bound verification, security, and dispatch evidence.
3. **Historical Records (Decisions & Telemetry):** Architectural Decision Records (ADRs) and closed feature audit logs.

```text
Repository Root (Git-tracked)
 ├── project/
 │    ├── pipeline.json               <- Canonical project authority & gate definitions
 │    ├── pipeline-state.json         <- Active feature, phase, plan and push approvals
 │    ├── critical-human-proof.json   <- Attended human signing policy & trust anchors
 │    └── push-threat-model.md        <- Bounded publication threat model
 ├── specs/<feature-id>/              <- PRD, technical specification, and acceptance criteria
 ├── evidence/                        <- Machine-generated candidate verification evidence
 ├── docs/adr/                        <- Architectural Decision Records (superseded & active)
 └── plugins/pipeline-core/           <- Shipped security guards and lifecycle hooks

Local Runtime Store (.git/agent-pipeline/ - Machine-local, Git-ignored)
 ├── human-guard-override-audit.ndjson <- Append-only hash-chained exception audit log
 ├── external-push-ledger.ndjson       <- Single-use push proof consumption ledger
 ├── dispatch-budget/                  <- Subagent tool invocation counters
 └── restart-receipts/                 <- Host restart & session recovery receipts
```

---

## 2. Versioned Project Authority (Tracked in Git)

| Artifact | Schema / Type | Purpose & Verification |
|---|---|---|
| `project/pipeline.json` | Project Manifest | Declares project identity, verification gate command, autonomy level, and ritual extensions. |
| `project/pipeline-state.json` | `pipeline.state.v0` | Authoritative lifecycle state: active feature, approved plan submission, phase history, and closed features audit array. |
| `project/critical-human-proof.json` | `pipeline.critical-human-proof-policy.v1` | Pins authorized human public keys (Ed25519) and declares whether critical operations (push, deploy) require human signatures or waivers. |
| `project/push-threat-model.md` | Markdown / Policy | Context-bound threat model describing sensitive data boundaries, target remotes, and excluded credential classes. |
| `specs/<feature-id>/` | Epic Specification | Contains `prd_*.md`, `spec.md`, and `acceptance.md` cryptographically bound to plan approvals. |

---

## 3. Verification & Security Evidence

All evidence required for gate passage is deterministically bound to an exact Git commit and tree hash:

- **Verification Evidence (`evidence/verify-latest.json`):**
  Schema: `pipeline.verify-evidence.v0`. Captures test suite execution results, exit codes, and candidate commit bindings. Evaluated at push time by `guard-push.mjs`.
- **Security Scan Evidence (`evidence/security-latest.json`):**
  Captures static analysis, secret-scanning, and dependency audits. Required when `gates.security.mode` is set to `blocking`.
- **Release Promotion Envelope (`evidence/release-promotion-*.json`):**
  Schema: `pipeline.release-promotion-envelope.v1`. Proves that a record-only candidate (R) derives strictly from a fully qualified source candidate (S) without substantive code changes, admitting one-way `release-satisfies-push` evidence reuse.
- **Dispatch Records (`evidence/dispatch-record-*.json`):**
  Schema: `pipeline.dispatch-record.v3`. Binds delegated subagent executions to specific Git commits, task IDs, and models.

---

## 4. Configured Human Gates & Attended Signing

Agent-Pipeline implements hard fail-closed boundaries for critical actions:
- **Plan Approval Gate:** Changes from `design` to `implementation` require explicit human PO approval recorded in `project/pipeline-state.json` (`planApproval`), bound to the SHA-256 of the PRD and Technical Specification.
- **Push Approval Gate:** PreToolUse hook `guard-push.mjs` enforces that any `git push` must:
  1. Have clean working tree and fresh, green verification evidence (`commit == pushed HEAD`).
  2. Carry an attended human signature from an authorized key listed in `critical-human-proof.json`.
  3. Consume an unconsumed proof in `external-push-ledger.ndjson`.
- **Standing Approval:** In designated development environments, standing approval may be configured via policy (e.g. ADR-0017), recorded explicitly in `project/pipeline.json`.

---

## 5. Private Local Ledgers (`.git/agent-pipeline/`)

Private runtime ledgers are deliberately maintained outside Git tracking inside the repository's `.git/` directory. This isolates machine-specific state and operator credentials:

- **Guard Maintenance & Override Audit:**
  `human-guard-override-audit.ndjson` maintains an append-only, SHA-256 hash-chained ledger of every human guard override (HGO), recording the plan digest, authorization proof, reason, and consumed capability token.
- **Single-Use Push Proof Ledger:**
  `external-push-ledger.ndjson` enforces that an attended Ed25519 signature cannot be replayed for multiple push commands.
- **Dispatch Budget Counters:**
  `dispatch-budget/<agent-id>.json` tracks tool invocation counts externally to enforce tool budgets before harness turn limits.
- **Absence Behavior (Clean Clone / Remote Review):**
  In a fresh clone, CI runner, or external audit environment, `.git/agent-pipeline/` is empty or absent. This is the **expected absence state**:
  - The repository's public-facing Git history contains the cryptographic signatures, proof metadata, and candidate-bound commit trailers (`Dispatch:`, `AI-Assisted:`).
  - External reviewers do not need local operator logs to verify that published commits passed automated gates and carried signed authorizations.

---

## 6. Waivers, Exceptions, and Deviation Handling

- **Waivers:** If a project permits pushing without a hardware/local key, an explicit waiver (e.g. `criticalProofWaiver: { kind: "push", reason: "..." }`) must be configured under ADR-0055.
- **Fail-Closed Principle:** Any unrecognized configuration, corrupted JSON evidence, stale candidate binding, or missing signature fails closed with an actionable error code (e.g. `PUSH-PROOF-MISSING`, `HGO-DRIFT`).
- **Data Privacy Standard:** Publicly committed documents and evidence files never contain private key material, full user environment variables, raw interactive session prompts, or absolute home directory paths.
