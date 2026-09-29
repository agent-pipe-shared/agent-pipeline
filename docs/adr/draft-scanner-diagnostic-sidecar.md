# Draft: Bounded scanner diagnostic sidecar

## Status and date

2026-09-29. The PO accepted G13's implementation scope and proposed architecture
in chat: **“G13 aufnehmen gemäß Vorschlag”**. The exact reviewed package is
`scratch/0.7-scanner-diagnostics-scope-proposal-20260929/architecture-decision-proposal/manifest.json`,
SHA `4e31e11bcd6e683b82dd86165440d122062e90d0686fd63739e9612667edd06e`.
The genuine decision is retained in `scratch/0.7-g13-po-decision-20260929.md`.
Ordinary implementation and qualification may proceed under that contract.

This Source ADR remains an unnumbered draft and its machine record has status
`proposed`. ADR-0069 allocates the ordinal and changes status to `accepted` only
at actual acceptance into the trunk. This formal continuity step is deferred;
it does not rescind the PO's implementation authorization. No signature,
protected-write capability, new lifecycle plan approval, effective module
mapping, adoption-state mutation or implementation/native PASS is asserted.

## Context

Semgrep's timeout classification can return ERROR with raw null and remove
temporary logs. Existing evidence may retain executable and candidate identity
without observed version, child signal/elapsed or bounded output structure.
This can hide a completed JSON summary followed by a child that failed to exit;
it does not identify a generic timeout cause. Adding fields to closed v1/v2
security evidence would violate existing boundary continuity.

Significance axes 1 (public API/component boundary), 2 (persistent storage),
4 (privacy/reliability), and 5 (public schema commitment) apply. Axis 3 grants
no new runner or host integration. This assessment follows the approved package;
it is not a claimed significance-tool execution.

## PO-approved implementation contract

1. Add an observation-only `pipeline.security-scanner-diagnostics.v1` sidecar
   at the canonical producer-selected evidence root's literal
   `evidence/security-latest.diagnostics.json`. Initial scope is the already
   invoked Semgrep child only. Bind the exact existing evidence payload and
   candidate commit/tree/input digests. Diagnostics never determine scanner,
   v1/v2 or push verdicts. Existing ERROR/missing/timeout policy, deadlines,
   rule selection, trust and final qualification remain independent.
2. Preserve the exact closed schema and storage/privacy contract in the approved
   package. Their SHA256 bindings are respectively
   `3832223d1d160b631ae4f0edd9dcddd73a5bfdc4b5e6f59ac28e808a90485a34`
   and `041c4454203e2cdda9840109e4a4e1438bee3cfbb37430ec2df70f6606d6e5d4`.
   Envelope UTF-8 is at most 16KiB, with at most one initial Semgrep record.
   Duplicate keys, unknown fields, inconsistent null/provenance states or
   mismatched evidence/candidate binding are rejected. Empty observations
   indicate no observed child, never PASS.
3. Persist only the allowed structured counts, bounded numeric child
   exit/error/signal/elapsed facts, executable and safe public rule digests,
   and numeric major.minor.patch from existing child JSON. Preserve explicit
   unknown/unobserved/withheld states. No extra scanner/version/Git subprocess
   discovers diagnostics. Parse at most 1MiB of already returned output without
   changing the original scanner's capture buffers or execution.
4. No raw or sanitized log excerpts, finding messages, exception text,
   environment, argv, arbitrary executable/config/root paths, session
   identifiers or raw-output hashes cross this surface. Version suffixes and
   unsupported strings are withheld. Aggregate counts/timing/content digests
   are the explicitly allowed disclosure classes; version shape is no tool
   attestation.
5. Rule observation is limited to exact candidate-tracked public regular files
   beneath the materialized candidate root. Auto/remote rules remain unknown.
   Reuse the existing inventory seam or report unavailable. Do not traverse
   private/untracked/ignored files, aliases, special files or foreign mounts.
   Preserve the package's 1,024-entry, 256-file, 1MiB aggregate, name and depth
   bounds. Use anchored no-follow bounded reads and before/after identity,
   size and content checks. Drift or inaccessible observations remain unknown;
   a stat-before-read alone cannot establish boundedness or stability.
6. Publication requires the canonical root and an anchored owned evidence
   directory with supported descriptor-relative no-follow primitives.
   Path-based lstat/realpath then rename is insufficient against ancestor
   replacement. Unsupported platform capabilities return publication
   unavailable; no shell helper, weaker filesystem mode or portability claim.
   A new native filesystem dependency requires a separately briefed architecture
   choice. Use exclusive no-follow 0600 regular/nlink1 sibling temp creation,
   bounded writes/flush/close and publication through the same anchored directory.
   Reject terminal/ancestor aliases, identity drift and conflicting concurrent
   publication. Atomic visibility does not claim stronger durability.
7. Retain only the latest successfully published sidecar by default. No archive,
   upload, migration, retention sweep or deletion of human-retained evidence.
   A stale sidecar is never advertised for this run unless its evidence digest
   matches. Publication failure emits the fixed non-sensitive notice
   `security-scan: diagnostic sidecar unavailable (exit code unchanged)` and
   cannot change the original scanner exit. Cleanup targets only this
   invocation's identity-verified temp. Unsafe cleanup discloses bounded failure
   and leaves inert bytes rather than reclaiming unrelated files.

The original inert code sketch is not approved as conformant implementation.
The frozen schema and storage/privacy contract govern any condensed description
above; if they must change, refreeze the affected proposal and obtain the needed
human decision. Source delivery, regression proof and final qualification remain
required completion work.

## Inherited decisions and alternatives

ADR-0032 supplies evidence-versus-approval and byte-stable baseline principles;
ADR-0044 separates observation from execution control; ADR-0045 supplies explicit
artifact topology/retention boundaries. ADR-0084's conservative structured
allow-list/no-excerpt policy is explicitly adopted for this sidecar, although its
original direct scope is public CI failure reporting. These contextual constraints
do not fabricate effective machine inheritance from accepted Markdown labels or
an advisory compiled inventory. No existing decision is superseded or waived;
no new organization policy is inferred.

Reject silent v1/v2 field extensions, raw log retention, another version process,
deadline increases, caller-selected diagnostic paths and diagnostic gating.
Existing nullable v2 identity fields alone do not retain child failure/elapsed
facts. The PO selected inclusion under this contract over deferral.

## Consequences and affected contracts

The implementation adds a bounded public artifact, closed validator, retention
obligation and explicit safe-publication capability requirement while preserving
existing evidence/verdict byte shapes and admission boundaries. Unknown records
can limit diagnosis. Unsupported publication is honest unavailable behavior,
not a fabricated delivered artifact. Semgrep adapter, security producer,
diagnostics helper/schema, existing regression blocks, exact dependency
registration and maps require scoped implementation ownership. No generic
adapter rollout or implicit exemption is authorized.

Qualification must cover invocation/verdict invariance, schema/binding bounds,
secret canaries, stale evidence, safe path/read/publication races, concurrency,
partial writes and cleanup interference. Deterministic child/transport fixtures
and actual native scanner acceptance remain separate evidence classes. This ADR
is the approved contract, not evidence that those checks passed.

## Supported Linux publication and schema refinement

Root reviewed this technical clarification under the PO-approved anchored-owned
contract. It does not add a new PO decision, native filesystem dependency or
authority. The prepared supported implementation uses Linux kernel procfs and
held no-follow directory descriptors. The evidence directory is owned by the
current UID and not writable by group/others. Component and inode readback detect
observable root, evidence-directory, terminal and staging drift. Other platforms
or unsupported primitives remain explicitly unavailable, without a weaker path
fallback or portability claim.

The trust boundary is a trusted same-UID process environment and cooperating
publishers in that owned directory. This does not isolate a hostile same-UID
process that can alter process memory or replace a terminal after the final
check; no atomic rename-CAS guarantee is claimed. Descriptor anchoring prevents
path traversal redirection, while terminal/inode checks detect observed drift.
Those are distinct guarantees. The approved contract contains no promise of
hostile-UID OS isolation.

The exclusive `.security-latest.diagnostics.pending` filename is a bounded
cooperative staging slot. Each admitted invocation exclusively creates and owns
its own staging inode; a conflicting or leftover slot returns busy. This realizes
the approved conflicting-publication refusal, not a persistent lock/grant store,
new authority or automatic retry. Its descriptor remains held through anchored
rename, committed-inode readback and directory fsync, then closes in finally.
Cleanup removes only this invocation's identity-verified staging inode. Crash
residue stays busy until an explicit safe operator disposition; no sweep/replay
or unsafe foreign-file reclaim is introduced.

The approved original schema SHA remains
`3832223d1d160b631ae4f0edd9dcddd73a5bfdc4b5e6f59ac28e808a90485a34`.
The prepared strict-refinement schema SHA is
`0e6e20da55df7174cb9e77358bb95e31c225e42464edfaa4866b64389ef1e816`.
Replacing the JavaScript `$` end assertion with `(?![\\s\\S])` in digest, OID
and numeric-version patterns rejects trailing newline characters; closed fields,
lengths, disclosure classes and null/unknown rules are unchanged. The two schema
artifacts are not byte-identical. The new digest must be bound explicitly in
delivery/evidence, alongside the original approved artifact. This technical
refinement does not silently weaken the approved shape or claim schema standards
interoperability testing that has not occurred.

## Formal acceptance procedure

At actual trunk acceptance, allocate the next free flat ordinal under ADR-0069;
rename both Markdown and companion sidecar, update their identity/living slug
references, mark the record `accepted`, and recompute its Markdown digest in that
same acceptance change. Preserve historical proposal and decision artifacts.
No supersession is needed. Before any shared compiled-summary change, request
Root's scoped ownership/approval for the canonical writer; a proposed inventory
entry must not be presented as effective accepted authority. This task neither
changes that summary nor invokes repository adoption/activation control.
