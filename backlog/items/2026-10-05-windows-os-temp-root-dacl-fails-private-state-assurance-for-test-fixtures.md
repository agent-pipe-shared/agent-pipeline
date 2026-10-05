---
schema: pipeline.backlog-item.v1
id: pipeline.windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Measurement 2026-10-05 (Alfred session, readiness follow-up RDY3), scratch IC-2 plan; ALFRED-BACKLOG-20261005 defect 13."
sprint: alfred
done_when: manual
---

# Windows OS temp root DACL fails private-state assurance for every fixture under os.tmpdir()

## Description

On native Windows the OS temp root carries a DACL that grants non-owner principals (SYSTEM, Administrators). Every test fixture created under `os.tmpdir()` therefore fails the private-state assurance ("Windows assurance is unavailable or unsafe"). This is the likely common cause of most of the ~125 v3 onboarding failures and many other win32 test failures; the same cases pass on POSIX/WSL.

## Triggering situation

Observed while classifying the readiness work against its parent commit; failures identical at the parent, so pre-existing win32 failures (platform parity, not a regression). Reproduction shape: run a suite whose fixtures use `fs.mkdtemp(os.tmpdir() ...)` on native Windows. Related convention item: `2026-08-17-test-suites-use-host-tmp-instead-of-the-repos-own-scratch-convention.md`.

## Affected artifact

Test fixture helpers across the plugin suites; `plugins/pipeline-core/lib/windows-private-state.mjs` (assurance).

## Proposal

Preferred: tests create a hardened private temp root (owner-only, non-inheriting DACL) once and place fixtures under it, with no security change. Alternative (a security decision for the PO, not an agent): make the assurance accept well-known system principals. Verification: the v3 suite failure count on native Windows drops accordingly.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
