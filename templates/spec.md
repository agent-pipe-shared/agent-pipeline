<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Spec (rigor level 1 / 2) — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: docs/operating-model.md §3.2–§3.4 (SDLC, readiness check),
ADR-0004 (rigor levels + EARS), Rensin design-doc structure
(Problem / Technical Plan / Alternatives / Detailed Implementation),
EARS patterns, OpenSpec delta pattern.
Language: English (spec is loaded by Goldfish/Critic at runtime → agent-facing,
ADR-0011 primary-reader rule; the PO reviews at the gate).

USAGE
1. Rigor level 0 tasks get NO spec file — issue/short briefing only (goal,
   forbidden, stop conditions; verify + evidence stay mandatory). Do not use
   this template for level 0.
2. Level 1 (delta, spec-first): use PART B (delta spec). Short forms allowed
   where marked. The spec may age after merge.
3. Level 2 (spec-anchored): use PART A (full spec). The spec lives in the repo
   and MUST be updated BEFORE merge on any deviation (anti-drift).
4. Replace every {{PLACEHOLDER}}, delete this comment block, delete the unused PART.
5. File location: {{SPEC_PATH e.g. "specs/{{TASK_ID}}-{{slug}}/spec.md"}} — level-1
   delta specs are archived after merge (OpenSpec pattern); level-2 specs stay.

HARD RULES (checkable)
- Alternatives section is MANDATORY from level 1 (level 1 may use the short form:
  1–3 bullets "considered and rejected"). Why: replaces team memory, prevents
  future sessions from re-excavating rejected ideas (Rensin A7).
  Check: readiness check + Critic reject specs without it.
- Every acceptance criterion MUST be EARS-formed and binary-checkable.
  Why: EARS makes each criterion 1:1 a test case — the bridge spec → tests →
  Critic (ADR-0004). Check: each criterion maps to at least one verify/test.
- Detailed Implementation MUST enumerate EVERY file to be changed/created, each
  with a rationale. Why: the critical anti-derailing instrument (Rensin K4/§5);
  it is simultaneously the Goldfish task interface. Check: Critic compares the
  diff's file list against this enumeration; unlisted files = finding.
- No-code rule: this document contains prose, diagrams, and criteria — no
  implementation code. Interfaces/signatures are allowed where they ARE the contract.
═══════════════════════════════════════════════════════════════════════════
-->

# Spec {{TASK_ID}}: {{TITLE}}

| Field | Value |
|---|---|
| Rigor level | {{1 or 2}} (rigor triage by Elephant) |
| Risk class | {{low or medium or high}} (operating-model §4.2; when in doubt: higher) |
| Status | {{draft / readiness-passed / implemented / superseded}} |
| Date | {{YYYY-MM-DD}} |
| Readiness check | {{result + date — MANDATORY for level 2, any architecture/guardrail/core-contract change, OR risk class high; optional at Elephant judgment otherwise (recommended for multi-file waves) — operating-model §3.4}} |
| Related | {{ISSUE_OR_BACKLOG_REF}} · {{ADR_REFS_IF_ANY}} |

---

## PART A — Full spec (level 2; also usable for large level-1 features)

### 1. The Problem

{{3–5 SENTENCES plain language: what is broken or missing, for whom, and why it
matters now. No solution language here.}}

### 2. Technical Plan

{{Jargon-light prose describing the intended solution shape: components involved,
data flow, integration points. One diagram (mermaid/ASCII) where it clarifies.
This is the "how" at architecture altitude — file-level detail belongs in §4.}}

### 2a. Stateful guard/control pre-readiness checklist (conditional, mandatory)

{{Complete this section before the first independent readiness dispatch WHEN the
design adds or changes a stateful guard/control: durable control state,
authority/replay semantics, recovery, or a mutation/enforcement boundary. State
the following explicitly; "handled by the implementation" is not an answer.}}

- Authority issuer and replay rule.
- Durable storage and atomicity boundary.
- Complete resource/phase crash-state matrix.
- Exact mutation point and kernel/controller enforcement point.
- Bootstrap and self-update transition.
- Binary candidate/evidence binding.
- Exact pre- and post-mutation bytes.
- Sole recovery authority.
- Self-reference audit (what mutable material cannot authenticate itself).

{{This is a documentation/readiness contract only: it does not claim a new
runtime enforcement mechanism and it is additive to, never a replacement for,
the EL-07 independent readiness check. Delete this section only when the
conditional trigger does not apply.}}

### 3. Alternatives (mandatory from level 1)

{{Everything considered and rejected, with the reason. These entries are
guardrails against future hallucinations and repeat debates.}}

| Alternative | Rejected because |
|---|---|
| {{ALTERNATIVE_1}} | {{REASON}} |
| {{ALTERNATIVE_2}} | {{REASON}} |

### 4. Detailed Implementation (every file + rationale)

{{Enumerate EACH file to be created/changed/deleted. This list is the contract:
the implementing Goldfish touches exactly these files; deviations must be
reported, never silently built in (operating-model §2.3 report format, item 5).}}

| # | File (repo-relative) | Change | Rationale |
|---|---|---|---|
| 1 | {{path/to/file}} | {{create / modify / delete}} | {{why this file, what moves here}} |
| 2 | {{path/to/file}} | {{...}} | {{...}} |

### 5. Acceptance Criteria (EARS)

{{Each criterion in EARS syntax — binary, testable, traceable. Patterns
(Mavin): Ubiquitous "THE SYSTEM SHALL …" · Event-driven "WHEN …
THE SYSTEM SHALL …" · State-driven "WHILE … THE SYSTEM SHALL …" · Optional
feature "WHERE … THE SYSTEM SHALL …" · Unwanted behaviour "IF … THEN THE
SYSTEM SHALL …".}}

- AC-1: WHEN {{trigger/event}}, THE SYSTEM SHALL {{observable behaviour}}.
- AC-2: IF {{failure condition}}, THEN THE SYSTEM SHALL {{safe behaviour}}.
- AC-3: {{...}}

### 6. Definition of Done

- All acceptance criteria above have green, machine-run checks: each AC maps to
  a test or a named step of `{{VERIFY_COMMAND}}` (single verify script).
- Evidence artifact is mandatory: script-written verify output + command +
  exit code (never model-written prose — operating-model §4.1, P4).
- Critic trigger per operating-model §4.2 matrix; for level 2 the Critic is
  mandatory. Architecture/guardrail/security diffs additionally require the
  higher-capability review tier with the selected runner's usable native
  isolation. `claude -p --bare` remains a Claude runner adapter, not a global
  critical-review mechanism. If that isolation is technically unavailable or
  unusable in the current host setup, use the standing PO-authorized functional
  equivalent: **one** fresh independently briefed Critic subagent with no
  chat/history or implementer reasoning, refs-only bounded input, strict
  read-only/no-write/no-subdelegation instruction, fixed candidate commit and
  diff, higher-capability route, JSON-schema-shaped verdict, and the literal
  assurance `functional-equivalent-read-only; OS isolation not asserted`. This
  is a standing authorization, not a per-candidate waiver: it preserves every
  T1 trigger, higher-capability escalation, evidence, independence, and
  finding-disposition requirement. The contractual read-only equivalent never
  claims OS isolation or effective provider model identity; if even it cannot
  be provided, stop at a PO course gate (canonical trigger wording:
  operating-model §4.2 — the German text is authoritative).
- Level 2 only: spec updated BEFORE merge on any implementation deviation.
- Canonical DoD checklist: `harness/definition-of-done.md` §2 (copy the block,
  strike items per the rigor matrix §4 there).

---

## PART B — Delta spec (level 1, OpenSpec pattern)

{{Describe ONLY the change, not the system. Keep §§1–3 from PART A in short form
(Problem: 3–5 sentences; Plan: one paragraph; Alternatives: 1–3 bullets
"considered and rejected"). Then replace §4/§5 with the delta sections below.
After merge, archive the delta spec (it may age; it is not maintained).}}

### ADDED Requirements

- AR-1: WHEN {{...}}, THE SYSTEM SHALL {{...}}.

### MODIFIED Requirements

- MR-1: {{previous behaviour}} → WHEN {{...}}, THE SYSTEM SHALL {{new behaviour}}.

### REMOVED Requirements

- RR-1: {{removed behaviour + why removal is safe}}.

### Files touched (every file + rationale — same contract as PART A §4)

| # | File (repo-relative) | Change | Rationale |
|---|---|---|---|
| 1 | {{path/to/file}} | {{...}} | {{...}} |

### Definition of Done

{{Same rules as PART A §6: EARS criteria → checks, verify + evidence mandatory,
Critic per §4.2 trigger matrix.}}
