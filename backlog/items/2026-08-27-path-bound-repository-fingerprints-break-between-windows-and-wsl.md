---
schema: pipeline.backlog-item.v1
id: pipeline.path-bound-repository-fingerprints-break-between-windows-and-wsl
type: defect
owner: pipeline
status: open
created: 2026-08-27
source: "NVA-PATHBIND-AUDIT-1, a read-only audit of every repository-fingerprint derivation, 2026-08-27 (scratch/PATHBIND-audit.md)"
---

# Path-derived repository fingerprints give the same checkout two identities across Windows and WSL

## Description

`derivePoGateRepositoryFingerprint` (`plugins/pipeline-core/lib/po-gate-authority.mjs`)
hashes `gitCommonDir` and `primaryRoot` as raw strings. The same working copy is
`/mnt/c/…` seen from WSL and `C:\…` seen from native Windows — different strings,
therefore a different fingerprint for the same repository. A second, independently
named derivation in `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` has the
same behaviour.

The audit found no normalisation anywhere in either mechanism: not of the drive
letter, not of the separator, not of case, and no WSL path mapping.

The failure is silent. Nothing errors; the caller simply gets a second, empty set of
state instead of the existing one, so receipts and ledger history become unfindable
after a change of access route.

## Triggering situation

A read-only audit run on 2026-08-27 while fixing a related class of defect: six call
sites in this repository derived a repository identity from a path when the
governance store's own bind-on-first-use identity
(`readLocalRepositoryFingerprint`) was the correct source. Two of those six were
genuine production defects and were fixed in that session (`35b01c06`, `269d15eb`,
plus `b02cbeb1`). This item covers what that fix did NOT reach: the remaining
path-derived fingerprints that are correct within one host but not across two.

## Affected artifact

- `plugins/pipeline-core/lib/po-gate-authority.mjs` — `derivePoGateRepositoryFingerprint`
- `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` — the parallel derivation
- Consumers: PO gate receipt, external push ledger, local supervisor state, the
  restart barrier, and the restricted attribution store
- [ADR-0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md)
  — makes runner/platform support an implementation obligation; the
  "native-Windows red-suite class" is tracked as a deliberate,
  non-release-blocking defect class under it

## Proposal

Introduce one canonical path normalisation and use it in both derivations. The
normalisation itself is the small half.

The real work is the migration question, which has to be answered separately at each
of the five storage sites: what happens to state that already exists under the old
fingerprint? Options are per-site and not obviously uniform — silent re-bind, an
explicit one-time migration, or a typed diagnostic that names the older identity and
asks. Choosing "do nothing" is also a defensible answer for a site whose state is
cheap to rebuild, but it must be a stated choice rather than an omission.

**Recommendation: Nova B.** This belongs in the same class ADR-0057 already tracks,
and the classification is consistent with that earlier decision — not a judgement
that the defect is harmless.

**Explicitly out of scope:** the tracked `governance/events/registry.json` binding.
That is a separate and harder defect (NVA-GESBIND-1) and is being handled in Nova A.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
