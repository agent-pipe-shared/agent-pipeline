# Project state — Agent-Pipeline

> Canonical operational handover for this repository. It contains public
> repository state only; durable decisions remain in the ADR register.

**Last updated:** 2026-07-20
**Project status:** ACTIVE
**Current block:** Public V3 Foundation stabilization — final close pending
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
  portable Verify boundaries, public-root documentation links, and scanner-safe
  Gitleaks fixtures. The machine-local PO receipt remains outside portable
  Verify; its fail-closed unit/runtime contract remains covered.
- Recovery-preview callback attestation and evidence-bound review retries are
  explicit public backlog designs, not completed runtime claims.
- TP-3 and TP-5 were temporarily removed only under explicit PO authorization
  for this bounded work, then restored exactly before final verification.
- Authorship correction: the seven unpublished Goldfish implementation commits
  were reworded with factual `Dispatch:` task identifiers and anonymous
  `AI-Assisted: true` markers. This corrects commit-level provenance without
  claiming a retroactively created dispatch record; the related public backlog
  items remain preventive process follow-ups.
- Full Verify at pre-close candidate `6b423d1d66ff2e59b6d1cbc7781ffc890006ae84`
  completed with exit 0 and machine-written Verify/Security evidence. A final
  exact-candidate Verify and independent Critic review remain required after
  this close documentation commit.

## Open items and next block

- Run Full Verify and the independent Critic review on the exact post-close
  candidate. A prior transfer course exception is not a Critic PASS.
- If both gates are green, push only the exact candidate to
  `origin/feat/v3-public-core-foundation`, then read back that ref. Do not push,
  merge, tag, or otherwise change `origin/main`.
- The separately preserved P2.6 branch is outside this block; its former clean
  worktree is backed up locally and no feature claim is transferred from it.
- No DELIVERED, ACCEPTED, or Critic-PASS claim exists until the exact final
  evidence and fresh independent review are available.

## Re-entry

1. Maintainers start with [`CLAUDE.md`](../CLAUDE.md).
2. Run the full [`pipeline-start` bootstrap](../harness/session-bootstrap.md).
3. Confirm the configured verify command is available.
4. Regenerate exact-candidate Verify/Security evidence and obtain a fresh
   path-only Critic review before considering the named feature-branch push.

## Recovery

No persisted in-flight dispatch, rollback action or public human-gate acceptance
is recorded. Use ordinary revert commits after publication; do not rewrite shared
history. If the checkout shows conflicting work, stop and report it before writing.
