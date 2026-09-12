# Verify failure-cluster correction — 2026-09-12

## Bound run

The source run was `verify-1789186614811-e0fa4986e9be7609`, bound cleanly
at start and finish to candidate
`be8cabc960c3b30d8b46c7c718baa3a960e4a14c`. It completed all 534
registered steps: 518 passed and 16 failed. The three suites targeted by the
case-completion migration all passed with complete receipts:

- runner-profile migration: 51/51;
- onboarding continuity: 280/280;
- project authority: 36/36.

An independent read-only failure-cluster audit found no regression in that
candidate. It classified the 16 failures as thirteen stale
fixture/inventory/evidence bindings and three test-isolation faults.

## Corrections

The runner-neutral correction sequence is:

- `ac799fff`: remove one absent future script from a draft's current
  `Governs:` set and declare all ten dispatch-record cases;
- `51dc0c34`: make the Critic-disposition dependency a never-liftable
  maintenance-window kernel path;
- `80011480`: refresh the existing synthetic Gitleaks fixture binding;
- `726f829c`: isolate the push-classifier and Antigravity-attestation tests;
- `675f4472`: refresh the offline protected Review-Protocol preimage;
- `55d09051`: bind three completed Critic FAIL reports while preserving
  their pending outcomes;
- `7830bc2c`: use the sanctioned mutable-artifact writer to rebind the
  current Nova specification and acceptance bytes without changing lifecycle
  state;
- `040bd5cf`: align two ready-observation fixtures with the producer's
  `runnerPermissions` field.

Focused readback is green for artifact topology, 39 threat-model checks,
Critic-skip coverage (seven applicable v3 records: one skipped, six evidenced,
zero required-pending), Reference-Path 13/13, GMW kernel closure 6/6, GMW core
62/62, Codex pretool 36/36, Antigravity hard enforcement 23/23, Advisory
bootstrap 6/6, Apply-Patch 16/16, dispatch-record 10/10, and the protected
preimage 4/4. The corrected Gitleaks fixture produced zero open findings and
one digest-bound ignored synthetic finding in a minimal path-identical scan.

The 133-case Codex Critic host suite was not claimed green: its WSL run passed
CCH001–020 and then stopped making progress, so the process was deliberately
terminated. The corrected ready-observation shape was instead exercised
directly against the real onboarding ready gate. This is runner-neutral
contract evidence only.

## Platform boundary and remaining decisions

Native Codex sandbox and App-Server execution under WSL remains deferred to a
future native-Windows package. No result above claims native WSL readiness, and
that deferred runtime is not a Nova-B blocker. The normal fresh-session Critic
remains the review default.

The terminal-action package still needs its separately recorded,
candidate-bound human data-privacy signoff. That human decision is not implied
by this deterministic correction or its review.
