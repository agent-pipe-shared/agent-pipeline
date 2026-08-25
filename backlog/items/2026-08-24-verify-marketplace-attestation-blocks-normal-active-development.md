---
schema: pipeline.backlog-item.v1
id: pipeline.verify-marketplace-attestation-blocks-normal-active-development
type: defect
owner: pipeline
status: open
created: 2026-08-24
source: "PO observation during the sprint-agy-runner D-fix wave, 2026-08-24"
due: 2026-08-31
---

# The deterministic Verify gate fails on ordinary, in-progress local development, not just on a real drift defect

## Description

`harness/scripts/verify.mjs`'s registered suite `human-guard-override-tests`
includes a test (`human-guard-override.test.mjs`, "F1 (dispatch
CRITIC-REMEDY-09): the local-plugin-install attestation succeeds against THIS
repository's own, real marketplace manifest and plugin source tree") that does
not run against an isolated fixture. It compares THIS machine's actual
external local-marketplace copy (`~/agent-pipeline-local-marketplace/plugins/
pipeline-core` on this host) byte-for-byte against the live checkout's
`plugins/pipeline-core` tree, via `externalLocalMarketplaceObservation()` /
`HGO-EXTERNAL-MARKETPLACE`.

Observed twice in one session (2026-08-24): every time a commit changes a file
under `plugins/pipeline-core/**` — which is the normal, expected shape of work
on this Pipeline-source repository — this check goes red until someone
manually re-syncs the external marketplace copy. It reproduced immediately
after a five-commit fix wave (D1/D2/D3/D6/D7) touched exactly the three files
the check then flagged as diverged.

## Why this matters

The check itself is a real, load-bearing security control: it is what
prevents an agent from claiming "the marketplace already has this fix" when
it does not, and it is directly connected to this same session's D7 finding
(a stale/misregistered marketplace-adjacent artifact silently disabling an
enforcement layer). It should not be weakened or deleted.

But its CURRENT placement conflates two different questions that have
different natural cadences:

- **"Is the code in this commit correct?"** — what `verify.mjs` exists to
  answer, deterministically, from fixtures, independent of this machine's
  current environment state.
- **"Is this machine's external marketplace copy currently in sync with this
  checkout?"** — a real question, but one whose answer changes on every local
  edit during active development and is irrelevant until the moment something
  is actually published or an agent relies on the marketplace copy being
  current (e.g. an Antigravity session loading guards from it).

Because both are folded into one deterministic gate, a developer or agent
mid-edit on `plugins/pipeline-core/**` sees Verify go red for a reason that
has nothing to do with the code just written, and the routine fix is "run
rsync," not "fix a bug." That is friction without signal, and it trains
whoever hits it to treat this specific red as background noise — which is the
failure mode most likely to also hide a REAL drift the next time it matters.

## Candidate directions (none implemented; PO/Advisor decision needed)

1. **Move the live-environment attestation out of `verify.mjs` entirely**,
   into a session-bootstrap or pre-push check that runs at a natural sync
   checkpoint (session start, or immediately before a push/release), rather
   than on every code-correctness gate run during active editing.
2. **Auto-sync the marketplace copy as a `verify.mjs` setup step** when the
   checkout is detected as the Pipeline source itself (never for a downstream
   consumer project, where the marketplace is authoritative and must not be
   overwritten by a checkout). Keeps the check inline but removes the manual
   step. Trade-off: gives a test script a machine-wide, cross-repo write
   side-effect (this marketplace also serves the nova checkout).
3. **Downgrade to WARN inside `verify.mjs`, keep BLOCKING at the push gate.**
   The moment this invariant actually needs to be true is publication time;
   the push-approval layer already exists as the right place to enforce it
   hard, while the day-to-day dev-loop gate stays informative, not blocking.

## Acceptance

- A design decision is made (Advisor-designed, per PO request 2026-08-24, so
  it works uniformly across runners/sessions rather than being hand-rolled
  here) among the directions above or an alternative.
- Ordinary commits that only change `plugins/pipeline-core/**` source, with no
  actual security regression, no longer fail the deterministic Verify gate
  for a reason unrelated to the code in that commit.
- The underlying security property (an agent cannot falsely claim the
  external marketplace matches the checkout) is preserved somewhere in the
  gate chain, not silently dropped.

## Design recommendation, 2026-08-25 (proposal — PO acceptance needed, not implemented)

**Recommendation: Direction 3 (downgrade to WARN inside `verify.mjs`, keep BLOCKING at the push gate).**

**Why not Direction 1 (move to session-bootstrap):** a long active-dev
session does not restart often — the check would run once per session and
then stay silent for the rest of a multi-hour editing block, during which
the marketplace copy could drift again without re-detection until the next
restart. It solves "noisy on every commit" but not "must be true at the
moment it actually matters" as precisely as gating at push time does, and
it adds a new checkpoint concept (`session-bootstrap` as a security gate)
where one does not currently exist for this class of check.

**Why not Direction 2 (auto-sync as a `verify.mjs` setup step):** the item
itself already names the real risk — a test script gets a machine-wide,
cross-repo write side-effect (this marketplace also serves the nova
checkout). A gate whose job is to VERIFY correctness should not also be the
thing that silently repairs the environment out from under a session that
did not ask for that; if the auto-sync itself has a bug, it could paper
over a real drift instead of surfacing it. Higher blast radius for the
same or lesser benefit than Direction 3.

**Direction 3 is the smallest change and reuses existing infrastructure
directly, not a new mechanism:**

- `externalLocalMarketplaceObservation()`
  (`plugins/pipeline-core/lib/human-guard-override.mjs:436`, already
  exported at line 2979) is already a standalone, reusable function — the
  fix is WHERE it is called and how its failure is treated, not new
  detection logic.
- `plugins/pipeline-core/hooks/guard-push.mjs` already has an established
  pattern for exactly this class of check: a hard, blocking pre-push proof
  requirement (`criticalProofWaiverFor`/`readCriticalHumanProofPolicy`,
  `project/critical-human-proof.json`). Wiring
  `externalLocalMarketplaceObservation()` into this same push-time gate (or
  the `pipeline-state.mjs approve-push` flow it backs) is adding a second
  instance of a pattern that already exists here, not inventing one.
- Inside `verify.mjs`'s `human-guard-override-tests` suite, the specific
  assertion that currently `fail()`s on a real, live, unsynced external
  marketplace copy would instead log a WARN-level line (visible, not
  silent) and return a passing suite result — preserving every OTHER
  assertion in that suite (fixture-based, deterministic) as still fully
  blocking. Only the one live-environment comparison changes tier.

**What this does NOT change:** the underlying security property (an agent
cannot falsely claim the external marketplace matches the checkout) stays
exactly as strong at the moment it is load-bearing — publication. It only
stops being asserted on every ordinary in-progress commit, which is the
actual friction the PO observed twice in one session.

**Not implemented — this is a proposal for PO acceptance**, per this
item's own Acceptance criteria ("A design decision is made... [PO decides
among the directions]") and the standing rule that an agent-authored
design decision on someone else's behalf is not the right shape for
something the PO explicitly asked to decide. If accepted, the follow-up
implementation is a `goldfish-deep` dispatch (guardrail-adjacent: touches
`verify.mjs`'s TP-3-protected suite registration for the WARN-downgrade
half, and `guard-push.mjs`/the push-approval flow for the new blocking
half) — not attempted here.
