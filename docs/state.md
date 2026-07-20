# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-07-20
**Project status:** ACTIVE
**Current block:** Public V3 Foundation stabilization — exact delivery tail
**Repair baseline:** `89c3c2ebf73d2b8cd3b43ee0ea463d2819c5f49f`
**Release version:** `0.2.0`

## Operational head

- Project calibration: [`.claude/pipeline.json`](../.claude/pipeline.json).
- Required gate: `node harness/scripts/verify.mjs`.
- Formal decisions: [`docs/adr/README.md`](adr/README.md); no state-local
  override is active.
- This file is the sole current/open/next handover under
  [ADR-0012](adr/0012-handover-canonicalization.md) and
  [ADR-0015](adr/0015-self-application.md).
- No reusable full-bootstrap receipt is stored publicly. Run the full bootstrap.
- Git availability and version are probed locally; machine-specific installation
  details are never versioned here.
- The candidate reconciles public marketplace/self-application assumptions,
  portable Verify boundaries, public-root documentation links, scanner-safe
  Gitleaks fixtures, neutral plugin identity, and the final transfer-completeness
  backlog. The machine-local PO receipt remains outside portable Verify; its
  fail-closed unit/runtime contract remains covered.
- Public remote heads are reduced to unchanged `main` and
  `feat/v3-public-core-foundation`. Anonymous obsolete lines have public
  recovery tags; histories with non-neutral authorship remain offline only and
  were not republished as Public tags.
- Portable implementation from Multi-CLI 0.3, Storm, Batman, and Hawkeye was
  audited without finding a missing Public implementation file. Remaining
  Sentinel go-live work is explicit Public backlog, not an imported private
  authority or a completion claim.
- The installed Public plugin cache is byte-identical to the committed plugin
  source at version `0.2.0+codex.20260720132741`. A new session is required to
  load it; this session does not claim a refreshed bootstrap.
- A slim private consumer overlay now pins the Public artifact but remains
  fail-closed for bootstrap until the Public activation bridge validates its
  lock and allowlisted extension namespaces. No private repository coordinate,
  identity, path, secret, receipt, or runtime value is recorded here.
- The generic plugin validator still rejects the manifest `hooks` extension and
  two deliberate non-model-invocable workflow skills. Passing Public parity
  classifier tests is not native validator admission evidence.
- Recovery-preview callback attestation, evidence-bound review retries,
  private-overlay activation, and target-bound cross-repository override
  ledgers are explicit Public backlog designs, not completed runtime claims.
- TP-3 and TP-5 were temporarily removed only under explicit PO authorization
  for this bounded work, then restored exactly before final verification.
- Authorship correction: the formerly unpublished Goldfish implementation
  commits carry factual `Dispatch:` task lines and anonymous `AI-Assisted: true`
  markers. This does not claim retroactively created dispatch records; the
  preventive provenance backlog remains open.
- One PO-confirmed GG-03 override authorized only a normal private-overlay
  `main` fast-forward. Its audit record remains private and local. The residue
  check caught that cross-repository ledger placement initially selected the
  coordinator checkout; no such entry was staged or committed Public.
- Full Verify at pre-close candidate `d85cae378755b2ab152d7ab619f69129b2fbf6fb`
  completed with 101 steps, exit 0, and exact machine-written Verify/Security
  evidence through the approved host boundary after a sandbox-only `EPERM`
  attempt. The exact post-close candidate still requires the same gates and a
  fresh independent Critic before delivery.

## Open items and next block

- Admit delivery only after Full Verify, Security, privacy checks, and a fresh
  independent Critic bind the exact post-close candidate. The earlier PO course
  exception is never a Critic PASS.
- Push only that exact candidate to
  `origin/feat/v3-public-core-foundation` and require exact remote readback. Do
  not push, merge, tag, or otherwise change Public `origin/main`.
- Triage the Sentinel go-live package, including native/generic validator A/B
  evidence and the private-overlay activation bridge, before any release or
  go-live readiness claim.
- Triage recovery-preview callback attestation, evidence-bound review retry
  economics, and target-bound override-ledger placement under their recorded
  owners and expiry dates.
- The monthly tooling-radar item is absent for the current month and is overdue;
  dispatch a fresh Public tooling-radar review in the next block.

## Re-entry

1. Maintainers start with [`CLAUDE.md`](../CLAUDE.md).
2. Run the full [`pipeline-start` bootstrap](../harness/session-bootstrap.md).
3. Confirm the installed plugin version and source/cache manifest digest before
   trusting the refreshed plugin in the new session.
4. Read back the named feature branch and rerun the configured Verify/Security
   gates if its OID differs from the local exact candidate.
5. Keep slim private overlays fail-closed until the Public activation bridge is
   implemented and independently reviewed.

## Recovery

No persisted in-flight dispatch, rollback action or public human-gate acceptance
is recorded. Use ordinary revert commits after publication; do not rewrite shared
history. If the checkout shows conflicting work, stop and report it before writing.
