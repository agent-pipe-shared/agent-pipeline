---
schema: pipeline.backlog-item.v1
id: pipeline.this-hosts-local-marketplace-copy-is-not-symlinked-to-source
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Independent full-Verify run on this checkout, 2026-08-17, while landing NVA-A7FIX-2/NVA-HGOFIX-1 -- human-guard-override-tests failed 5 of its cases with HGO-EXTERNAL-MARKETPLACE, unrelated to any commit made this session."
---

# On this machine, `~/agent-pipeline-local-marketplace/plugins/pipeline-core` is a real directory, not the symlink/junction ADR-0052 requires

## Description

`human-guard-override.mjs`'s `externalLocalMarketplaceObservation()`
(NVA-BL-20, already on `main` before this session's own work) requires the
external local-marketplace root's `plugins/pipeline-core` entry to be a
symlink/junction that resolves back to this checkout's own
`plugins/pipeline-core` (ADR-0052's documented local-development
arrangement). On this machine it is instead a plain, independent directory:

    $ ls -la ~/agent-pipeline-local-marketplace/plugins
    drwxr-xr-x 16 skar667 skar667 4096 Aug 10 10:38 pipeline-core

(no `l` mode bit, no `->` target — a real copy, last synced 2026-08-10, six
days stale relative to today's commits). `externalRealpath()` therefore
resolves it to itself, never to `repo.root/plugins/pipeline-core`, and every
call path through `localPluginInstallSourceObservation()` fails with
`HGO-EXTERNAL-MARKETPLACE: external local marketplace does not resolve to
this checkout`.

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

Not a code defect — a host-environment configuration gap on this specific
machine's `~/agent-pipeline-local-marketplace` installation, relative to what
`plugins/pipeline-core/lib/human-guard-override.mjs`'s NVA-BL-20 code (and
ADR-0052) expects.

## Proposal

Outside agent-session reach by design: `human-guard-override.mjs` itself
refuses agent write access beyond the project root, and rebuilding a Codex
plugin-registry symlink/junction on the host filesystem is exactly the class
of action that boundary exists to keep human-attended. The PO needs to
either (a) re-run whatever local-development onboarding step creates the
ADR-0052 symlink/junction so `~/agent-pipeline-local-marketplace/plugins/
pipeline-core` again points at this checkout, or (b) refresh the marketplace
copy through the project's normal `claude plugin marketplace update`/
`claude plugin update` flow if a real (non-symlinked) copy is the intended
mode on this machine and the check should tolerate it -- which would be a
design question, not assumed here. This is the same underlying
"marketplace-copy refresh" gap already surfaced independently by a
downstream consumer-project report the same day (2026-08-17); the two
reports corroborate each other but describe different specific symptoms (a
stale hook allowlist there vs. an unlinked entry, timestamped Aug 10, here).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as filed -- PO-gated, no agent-session action possible.
- **Rationale:** `human-guard-override.mjs`'s own out-of-root write refusal is the correct, deliberate boundary (see `specs/sprint-nova-epic/plans/nova-setup-bootstrap.md` §5a) and must not be routed around from inside a session.
- **Assignment (if accepted):** PO, next time they refresh this machine's local marketplace installation.
- **Date:** 2026-08-17
