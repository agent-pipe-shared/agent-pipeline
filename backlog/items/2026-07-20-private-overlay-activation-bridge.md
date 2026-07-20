---
type: workflow-improvement
status: in-progress
created: 2026-07-20
source: Public review of the slim private-overlay consumer activation boundary
owner: Pipeline Elephant
due: 2026-08-10
expires: 2026-08-17
---

# Activate pinned private overlays through the Public Core

## Description

The installed plugin can read a project-root `pipeline.user.yaml` through
project-scoped scripts, but it does not automatically discover or validate
`.agent-pipeline/core.lock.json` and does not load the allowlisted private
overlay namespaces under `.agent-pipeline/`. A slim overlay intentionally has
no local `setup.mjs` or verification harness, so the current `pipeline-start`
path must fail closed and cannot support a bootstrap or go-live readiness claim.

## Triggering situation

The Public transfer and private-overlay boundary review on 2026-07-20 reduced
the private consumer to configuration, an exact Public binding, and neutral
extension points. That reduction exposed the missing portable activation bridge
between a project overlay and the installed Public Core.

## Affected artifact

The Public `pipeline-start` admission path, project-scoped configuration
validation, installed-plugin identity read-back, private-overlay extension
loading, sanitized activation evidence, and their positive and negative tests.

## Proposal

Implement a portable Public-Core activation adapter that:

- parses and validates the project-root `pipeline.user.yaml` as
  `pipeline.user.v3` before any project activation;
- discovers `.agent-pipeline/core.lock.json` without following symlinks and
  validates its repository, branch, commit, tree, plugin name, plugin version,
  and manifest digest against the selected Public candidate and installed
  plugin identity;
- admits extension inputs only from the declared `policies`, `guidelines`,
  `templates`, and `extensions` namespaces, in that fixed class order and
  lexical order within each class, without allowing an overlay to replace
  Public authority implicitly;
- rejects an absent or malformed configuration or lock, every identity or
  digest mismatch, symlinked input, path escape, undeclared namespace, and any
  private identity, secret, machine, receipt, cache, evidence, or runtime
  input;
- emits sanitized machine evidence bound to the exact candidate and plugin
  identity, using reason codes, digests, and admitted class counts rather than
  private values, raw content, or local paths; and
- has deterministic positive tests plus negative tests for every rejection
  boundary, including missing inputs, mismatches, symlinks, traversal, and
  prohibited private-runtime material.

Until those tests and exact-candidate verification are green, `pipeline-start`
must remain fail-closed for the slim overlay and must not claim bootstrap,
activation, conformance, or go-live readiness. This item is a prerequisite of
the remaining
[`2026-07-20-sentinel-go-live-completion.md`](./2026-07-20-sentinel-go-live-completion.md)
work rather than a private implementation task.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted portable activation
package. The triage due date is **2026-08-10**. If no decision is recorded by
**2026-08-17**, this item expires and must be renewed with current Public
evidence before implementation or any readiness claim.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted as Sentinel package **SNT-A**. The original item is
  translated into the independently reviewable slices SNT-A1 admission,
  SNT-A2 Public Source/Installed identity, SNT-A3 digest-bound projection and
  PO-profile publication, and SNT-A4 combined bootstrap/readback integration.
- **Rationale:** A slim overlay cannot use a private setup script or harness as
  an identity or activation fallback. The bridge therefore belongs in the
  installed Public Core and must remain explicit, read-before-write,
  exact-candidate-bound, authenticated at input consumption, and sanitized at
  every machine-evidence boundary.
- **Assignment (if accepted):** Pipeline Elephant, with independent Goldfish
  implementation slices and a fresh Critic before activation.
- **Date:** 2026-07-20

## Implementation checkpoint — 2026-07-20

- SNT-A1 through SNT-A3 are implemented locally with focused positive and
  fail-closed tests; they are not yet a published or activated candidate.
- SNT-A4 integration, aggregate Verify registration, installed-cache/slim-
  overlay end-to-end evidence, independent Critic review, exact-candidate
  publication, reinstall, and activation readback remain required.
- The current implementation session uses a PO-authorized temporary Codex
  Sol/high route exception. The intended execution route remains Terra/high;
  no evidence from this session may claim that Terra was observed.
- Completion of SNT-A removes only the private-overlay activation prerequisite.
  It does not by itself satisfy the separate Sentinel go-live, legal,
  publication, documentation, or full project-calibration gates.
