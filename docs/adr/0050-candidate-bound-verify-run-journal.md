# ADR-0050 — Candidate-bound private Verify run journal

**Status:** accepted by PO Nova design approval · **Date:** 2026-08-01

## Context

Full Verify currently buffers a synchronous suite until it terminates. An
interrupted long run therefore exposes insufficient structured progress and
cannot safely distinguish completed coverage from partial or unknown work.
Issue #98 requires observable progress and candidate-bound resume without
creating a second portable project State or reducing registered coverage.

The journal survives a process interruption and is therefore durable recovery
authority. Its ownership, privacy, retention, cleanup and cross-platform
durability must be fixed before implementation.

## Decision

Each Full Verify attempt owns one private run directory below the physical Git
common directory's Pipeline state. It is machine-local and never tracked. The
directory is bound to the physical repository identity, candidate commit and
tree, complete Verify policy/registration digest and one unique run ID.

The current operating-system user owns the directory and every entry. Writers
require restrictive non-group/non-world-writable permissions, regular files,
unambiguous link counts, no symlink traversal and one exclusive run lock. The
closed contents are a run manifest, append-only progress journal, one bounded
complete log per suite and one terminal receipt per completed suite. Interactive
progress is a bounded projection of journal events, not the full log.

A terminal suite receipt binds suite ID and implementation digest, declared
file and non-file inputs, relevant environment contract, candidate tree and
Verify policy. Resume reuses only a receipt whose complete binding and log
validate. Running, partial, unknown, malformed or missing work reruns. Drift
invalidates the affected receipt and deterministic dependents; it never turns
unknown work into PASS. Final evidence still covers the complete current
registered suite set.

File replacement is atomic. File and directory durability is attempted at the
strongest supported host boundary; a platform that cannot attest a required
operation returns a typed durability status rather than a success claim.
Windows-specific directory-handle limitations use the project's existing
capability-aware durability contract and do not weaken regular-file writes.

Every run directory is registered with the session cleanup descriptor. Normal
close removes only the exact descriptor-owned closed run. Interrupted runs may
be resumed or retired only after exact repository/run/owner/lock readback; age,
path prefix or a process name alone never authorizes takeover or deletion.
Retention is bounded by the owning session and explicit recovery disposition.

## Consequences

- The journal is Verify recovery evidence, not plan approval, project State,
  publication authority or a release result.
- Complete private logs remain outside the interactive channel and public
  candidate evidence; public records contain only sanitized terminal digests.
- Resume can save completed work without skipping coverage.
- Cleanup and recovery must fail closed on identity, permission, link, lock,
  candidate, input, environment or policy drift.
- A material location, authority, retention or cross-host transfer change
  requires a successor ADR.

## Alternatives rejected

- Parsing console prose, because output text is not closed machine evidence.
- Treating journal or log presence as PASS, because an interrupted writer can
  leave partial bytes.
- Storing resume state in `project/pipeline-state.json`, because that creates a
  second lifecycle responsibility and unnecessary merge conflicts.
- Reusing receipts by suite name alone, because candidate, implementation,
  inputs, environment and policy can drift independently.
- Deleting stale-looking directories by age or prefix, because neither proves
  ownership or non-liveness.

## Resubmission

Review with the first completed #98 interruption/resume evidence and before any
cross-host or shared-cache design. Owner: Nova Product Owner. No later than
**2026-08-31**.
