# CYB-2 — policy-complete verification (feature spec)

> **Status: DRAFT, design-phase, pre-gate.** Translates issue #42 (fetched
> verbatim via `gh issue view 42`, 2026-07-25) into checkable form. Phase II,
> depends on the CYB-1 boundary (CYB-1F's `cap.*` roots and control-result
> enum — see [`cyb-1f-schema-boundary-draft.md`](cyb-1f-schema-boundary-draft.md)
> §9 "Downstream binding map": CYB-2 binds to `cap.*` roots, control-result
> enum, catalog digest). Not dispatched.

## 1. Problem (condensed)

Today's verification cannot distinguish "every required control ran and
passed" from "the available subset reported no blocking finding" —
`SKIPPED` contributes no blocking class, so a machine missing scanner
binaries can exit 0. Outcome: make security verification **policy-complete** —
derive required capabilities from the CYB-1 control profile, execute or
explicitly resolve every one, fail closed on skipped/unavailable/stale/
invalid/partial required capabilities.

## 2. Required invariants (verbatim from #42, already checkable)

1. Green verdict ⇒ every policy-required capability reached an accepted
   terminal state.
2. `SKIPPED` ≠ `PASS`, ever.
3. Optional/inapplicable controls don't block on absent tooling.
4. Required tools/rule-packs/configs are pinned or digest-bound.
5. Coverage and exclusions are visible and candidate-bound.
6. Scanner failure, environment failure, unsupported stack, policy failure
   get distinct diagnostics.
7. Core semantics are provider-neutral, testable without commercial services.

## 3. Acceptance criteria — checkable form

| # | #42 AC (paraphrased) | Checkable criterion | Evidence class |
| --- | --- | --- | --- |
| AC1 | Green blocking verdict proves all required capabilities completed accepted states | Fixture: a run with one required `cap.*` capability left at any non-accepted state cannot exit green | Negative-gate fixture |
| AC2 | All-skipped / required-skipped fail with stable typed diagnostics | Two dedicated fixtures (`all-skipped`, `one-required-skipped`) assert distinct typed codes, not a generic failure | Negative-gate fixture |
| AC3 | Optional/inapplicable capabilities absent without false failure, explicit reasons | Fixture with an optional `cap.*` root absent still exits green, with a machine-readable reason field populated | Fixture |
| AC4 | Capability/tool/rule/config/policy/input/environment identities evidence-bound | Evidence schema requires all listed identity fields non-empty; a run missing any one fails schema validation | Schema fixture |
| AC5 | Findings and coverage use closed normalized schemas | `security-evidence.v2` schema fixture validates a full finding envelope + a full coverage record; malformed variants rejected | Schema fixture |
| AC6 | Exclusions/ignored/unsupported scope/truncation/data-age visible | Coverage record fixture asserts these six fields are always present (empty is a valid value, absent is not) | Schema fixture |
| AC7 | Floating rule/config/data updates cannot silently change a repeated verdict | Fixture: identical candidate + changed external rule data (no snapshot bump) does not silently pass; requires named update policy + snapshot identity | Drift fixture |
| AC8 | Push/PR/Close/Release consume the same completeness evaluator | One evaluator function; each of the four call sites' integration test asserts it invokes that same function (no parallel duplicate evaluator) | Integration fixture |
| AC9 | Evidence bound to exact immutable candidate (#40) | Evidence record's candidate field matches #40's snapshot digest; a mismatched candidate is rejected | Binding fixture |
| AC10 | Read-only preflight reports missing capabilities without changing repo state | Preflight run fixture asserts zero filesystem/git mutations (diff before/after is empty) while reporting required/available/missing/unsupported/optional | Preflight fixture |
| AC11 | v0→v2 migration explicit; v0 cannot silently satisfy new blocking policy | Migration fixture: a v0 evidence record evaluated under v2 policy is rejected/insufficient, never silently accepted as complete | Migration fixture |
| AC12 | Fixtures cover every failure/compatibility class on supported platforms | Full fixture matrix per §4 below, run on every supported platform (native Windows included, per the decision-D/Windows-assurance-slice cross-link) | Fixture matrix |
| AC13 | Docs distinguish clean/complete/unavailable/unsupported/waived/not-applicable | Doc lint or generated-from-schema check: all six terms defined distinctly, no doc conflates `unavailable` with `not-applicable` | Doc check |
| AC14 | No commercial service required for core conformance | Full conformance suite runs offline with fake adapters only; CI job asserts no outbound network call during that suite | CI/network-isolation fixture |

Coverage note: matches `backlog-acceptance-matrix.md`'s "14" count for #42.

## 4. Fixture matrix (from #42 §8, the actual test-first inventory)

all-pass · blocking+non-blocking findings · all-skipped · one-required-skipped
· optional-skipped · empty/stale rule pack · unsupported language ·
environment execution failure · timeout/cancellation · partial/truncated
coverage · malformed output · version/config/policy drift · changed candidate
after planning · cross-platform tool resolution.

Per spec.md §5 ("negative gates... get failing fixtures FIRST"), these fifteen
fixtures should exist and fail meaningfully **before** the aggregate evaluator
is implemented, then flip green one at a time as the evaluator is built.

## 5. Scope carried (from #42 §1-§8, mapped to spec.md's CYB-2 summary)

- **L2 plan builder** — deterministic required-capability plan from the
  effective CYB-1 control profile; plan digest joins candidate evidence.
- **Adapter contract v2 migration** — the four existing adapters (gitleaks →
  `cap.secrets`, osv-scanner → `cap.sca`, semgrep → `cap.sast`, license-check
  as a catalog control) gain the full capability-contract fields (#42 §2):
  capability IDs, supported ecosystems, versions, offline/network behavior,
  required inputs, severity/confidence normalization, coverage/limitations,
  exit mapping, timeout/cancellation, evidence fields.
- **L3 evaluator + `security-evidence.v2`** — the ten-state classification
  from #42 §3 (`pass, findings, required-capability-missing, unsupported,
  execution-unavailable, partial-coverage, stale, invalid, not-applicable,
  waived`) — this is the exact enum CYB-1F §7 already cross-references as
  "the L3 per-capability run outcome enum," including CYB-1F's open decision
  F-3 (ratify the run-outcome → control-result projection). **CYB-2 cannot
  finalize its evaluator before F-3 is resolved at the CYB-1F freeze
  checkpoint** — flagging this dependency explicitly since spec.md's package
  summary doesn't spell it out.
- **Guard-push plan-completeness extension** — with a per-repo compatibility
  window (PRD deviation D9: manifest-less behavior only via explicit
  `not-applicable` policy; window ends on first L1 policy adoption, reviewed
  at sprint close).
- **Read-only preflight** — extends the existing toolchain-preflight pattern
  (already used elsewhere in the pipeline for scanner-availability checks).

## 6. Non-goals (verbatim from #42)

Claiming policy-complete scanning proves absence of vulnerabilities; running
every possible scanner on every repo; auto-installing tools or granting
network access; treating repository-host annotations as authority; replacing
human risk decisions or the governed finding lifecycle (that's CYB-8).

## 7. Dependencies

#40 (exact immutable candidate binding) — hard prerequisite, already
available. #41/CYB-1 boundary — hard prerequisite, gated on CYB-1F's F-3
decision specifically. #27 (least-privilege baseline). #39/CYB-3 (SBOM inputs
for dependency/release checks) — soft, CYB-2 does not block on CYB-3.

## 8. Gate

Per spec.md §6: Full Verify + Security green, independent fresh Critic, THEN
PO gate — same universal package rule. No dispatch before CYB-1F's F-3
decision is ratified and the epic-level PO gate's relevant open decisions
are resolved.
