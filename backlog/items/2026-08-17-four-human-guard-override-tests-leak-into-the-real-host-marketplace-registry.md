---
schema: pipeline.backlog-item.v1
id: pipeline.four-human-guard-override-tests-leak-into-the-real-host-marketplace-registry
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Elephant investigation, 2026-08-17, after the PO resynced this host's local marketplace copy and reloaded the plugin: 4 of the 5 previously-documented 'human-guard-override-tests marketplace-staleness' failures did NOT clear, while a 5th (F1 CRITIC-REMEDY-09) did. Investigated why -- root cause is different from what every prior record this session (including the consolidated Critic review's F-0) attributed it to."
---

# Four `human-guard-override.test.mjs` tests leak into the real host's Codex marketplace registry instead of mocking it, so they fail on any host with a real `agent-pipeline-local` directory-copy entry, independent of staleness

## Description

Every record this session (dispatch records, the consolidated Critic review's
F-0 finding, `docs/state.md`) attributed the 5 known-red
`human-guard-override-tests` sub-tests to the external local-marketplace
copy's content being *stale* relative to this checkout. After the PO
resynced `~/agent-pipeline-local-marketplace/plugins/pipeline-core` and
reloaded the plugin, a direct tree-hash comparison
(`scratch/diff-marketplace-tree.mjs`, all 856 entries) confirmed the
checkout and the external copy are now byte-identical. Re-running the
suite: **one** of the five (`F1 (dispatch CRITIC-REMEDY-09): the
local-plugin-install attestation succeeds against THIS repository's own,
real marketplace manifest and plugin source tree`) now passes, confirming
the underlying `NVA-MKTHASH-1`/`NVA-MKTHASH-2` fix works correctly against
a real, freshly-synced environment. The other **four** still fail, with the
same `HGO-EXTERNAL-MARKETPLACE` "content does not match this checkout"
message as before the resync.

**Root cause (traced): these four tests build a tiny SYNTHETIC fixture
project root** (`fixture()`, a temp directory containing only a minimal
`.codex-plugin/plugin.json` and `.claude-plugin/marketplace.json` — see
e.g. `human-guard-override.test.mjs:474-504`), then call
`recordHumanGuardDenial({ rootDir: root, ..., spawn: noGit })`. `spawn:
noGit` only fails git-shaped subprocess calls (simulating "host-Git-
unavailable", the test's actual subject); it does NOT override
`externalLocalMarketplaceObservation()`'s `registryReader`, so
`codexMarketplaceRegistry()` runs the REAL `codex plugin marketplace list
--json` against THIS HOST's real, actually-registered
`agent-pipeline-local` entry. `localPluginInstallSourceObservation()`
(`:583`) computes `pluginTreeSha256` from the FIXTURE's own tiny
`plugins/pipeline-core` directory (one or two files), then threads that in
as `checkoutTreeSha256` (`:589`) to compare against the REAL external
copy's real 856-file content hash. **These two values can never be equal by
construction**, on ANY host that has a real (non-symlink, directory-copy)
`agent-pipeline-local` entry registered — regardless of whether that
external copy is fresh, stale, or perfectly synced. This is a test-
isolation gap (a test using a synthetic fixture leaking into real host
state it does not control or mock), not an environmental staleness
condition, and it predates this session: the same 4 tests were already
red before `NVA-MKTHASH-1` touched this file, just failing at the
symlink-resolution check instead (a different message, same underlying
fixture-vs-real-host mismatch).

## Triggering situation

Observed live 2026-08-17 on this host, immediately after the PO's marketplace
resync + `/reload-plugins`, expecting all 5 previously-red sub-tests to
clear per this session's own F-0 exception note. Only 1 of 5 cleared.

## Affected artifact

`plugins/pipeline-core/lib/human-guard-override.test.mjs` — the four tests:
"a host-Git-unavailable hook can consume only the exact audited local plugin
installation" (`:474`), "local plugin installation capability rejects a
changed candidate source" (`:569`), "ADR-0059 Decision 1: the
global-plugin-install denial class is refused for the signed path with
HGO-SIGNATURE-UNSUPPORTED-MODE" (search for this title), "NVA-BL-20 F5: the
Codex marketplace-registry spawn is injectable from all three production
entry points" (`:1955`).

## Proposal

Not designed here. Each test's actual subject (git-unavailability,
changed-candidate-source rejection, signed-path denial class, spawn
injectability) is orthogonal to the external-marketplace content-hash
check that now trips first. Likely direction: give each of these four
tests its own `registryReader`/mocked external-marketplace fixture (the
pattern the `NVA-MKTHASH-1`/`NVA-MKTHASH-2` tests already use,
`localRegistry(external)`) matching a SYNTHETIC checkout, so the test
exercises only its own stated subject and does not depend on this host's
real, uncontrolled marketplace registration state. Needs the actual test
author's intent confirmed for each (what SHOULD the marketplace-check
outcome be for their specific scenario) rather than a blanket mock.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — real, independently traced root cause, corrects
  this session's own prior mischaracterization (F-0 in the consolidated
  Critic review, and every dispatch record before it, called this
  "content staleness").
- **Rationale:** not blocking the current candidate (these 4 were already
  red before this session's changes, under a different message; the
  underlying production fix is proven correct by the 5th test now passing
  against real, fresh, synced content). Test-only change, no guardrail
  production-code risk, but touches security-relevant test fixtures, so
  still routed to a dispatch rather than hand-authored.
- **Assignment:** queued; not yet dispatched.
- **Date:** 2026-08-17
