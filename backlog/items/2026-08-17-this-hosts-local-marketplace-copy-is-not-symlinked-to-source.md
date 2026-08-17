---
schema: pipeline.backlog-item.v1
id: pipeline.this-hosts-local-marketplace-copy-is-not-symlinked-to-source
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Independent full-Verify run on this checkout, 2026-08-17, while landing NVA-A7FIX-2/NVA-HGOFIX-1 -- human-guard-override-tests failed 5 of its cases with HGO-EXTERNAL-MARKETPLACE, unrelated to any commit made this session."
---

# `externalLocalMarketplaceObservation()` requires a symlink/junction, but the PO's actual, deliberate workflow rsyncs a real copy instead

## Description

`human-guard-override.mjs`'s `externalLocalMarketplaceObservation()`
(NVA-BL-20, already on `main` before this session's own work) requires the
external local-marketplace root's `plugins/pipeline-core` entry to be a
symlink/junction that resolves back to this checkout's own
`plugins/pipeline-core` (ADR-0052's documented local-development
arrangement). On this machine it is instead a plain, independent directory:

    $ ls -la ~/agent-pipeline-local-marketplace/plugins
    drwxr-xr-x 16 skar667 skar667 4096 Aug 10 10:38 pipeline-core

(no `l` mode bit, no `->` target). **The PO has confirmed this is
deliberate, not drift:** finished candidates are rsync-copied to the local
marketplace root on purpose, because a symlink arrangement caused problems
for them in practice. `externalRealpath()` therefore resolves the entry to
itself, never to `repo.root/plugins/pipeline-core`, and every call path
through `localPluginInstallSourceObservation()` fails with
`HGO-EXTERNAL-MARKETPLACE: external local marketplace does not resolve to
this checkout` — for a legitimate, intentional deployment shape, not a
misconfiguration.

## Triggering situation

A genuinely clean, independently-run `node harness/scripts/verify.mjs`
against candidate `ad512e80` failed with `human-guard-override-tests=1`
(exit 1). Confirmed via `git log aeefe5c8..HEAD` that no commit made this
session touches `human-guard-override.mjs`, its test, or any
marketplace-resolution code; confirmed via `git merge-base --is-ancestor`
that the NVA-BL-20 code performing this check was already an ancestor of
this session's own starting commit, i.e. this is not a regression this
session introduced. Re-ran the same suite directly (`node --test
plugins/pipeline-core/lib/human-guard-override.test.mjs`): 5 of 43 fail,
all and only the `HGO-EXTERNAL-MARKETPLACE` cases; every other case,
including the three new NVA-HGOFIX-1 regression tests, passes.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.mjs`,
`externalLocalMarketplaceObservation()` (NVA-BL-20) — the check's design
assumption (symlink/junction only), and by extension ADR-0052's documented
local-development arrangement, which this proposal would need to extend
rather than the code alone.

## Proposal

A code/design fix, not a PO host-side action: `externalLocalMarketplaceObservation()`
already computes `pluginTreeSha256` (a content hash of this checkout's own
`plugins/pipeline-core` source tree) for exactly this function's own
`statusSha256` binding. The same primitive can verify a REAL, rsync-copied
directory just as strongly as a symlink verifies one — hash the external
copy's tree with the identical walker and compare against this checkout's
`pluginTreeSha256`, accepting either a symlink that resolves back to this
checkout (current behavior, kept) OR a real directory whose content hash
matches (new). This still refuses a mutated, stale, or unrelated copy
exactly as today, while accepting the PO's actual deployment shape. Needs a
design pass before implementation: what "stale" should mean for a hash-equal
but differently-timestamped copy, and whether ADR-0052 itself should be
amended to document rsync-copy as a second sanctioned local-development
shape alongside symlink/junction.

This is the same underlying "marketplace-copy refresh" theme already
surfaced independently by a downstream consumer-project report the same day
(2026-08-17) — that report's actual root cause was a stale hook allowlist,
unrelated to this one, but both point at the same operational reality: a
finished candidate's code and the installed marketplace copy can drift
apart, and today's tooling has more than one way to notice that drift.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — reframed after PO clarification (2026-08-17) that the rsync-copy deployment shape is deliberate, not drift. Not fixed in this same session pass: real design work (ADR-0052 amendment question, hash-equality semantics) belongs in a dedicated design/goldfish-deep pass with mandatory Critic review, not a same-session patch to security-relevant marketplace-attestation code.
- **Rationale:** the check's own severity is correct (fail closed on an unverified external root) — the gap is that it only recognizes one of the PO's two legitimate deployment shapes.
- **Assignment (if accepted):** next available dedicated design slot.
- **Date:** 2026-08-17
