---
schema: pipeline.backlog-item.v1
id: pipeline.critical-human-proof-not-materialized-for-signature-mode
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Turn-efficiency root-cause analysis of the PO's private Claude+Pipeline 0.5.4 happy-path test run, 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
---

# A fresh `signature`-mode project has no `project/critical-human-proof.json`, forcing the full Human-Guard-Override ceremony just to bootstrap it

## What happened

`2026-08-09-the-push-gate-is-silent-in-every-consumer-project.md` (closed) shipped
a seeded `push` gate chapter in the manifest and fixed `verifyCriticalHumanProof`'s
evaluation order, verified end to end in `chat` mode (PUSHSEED-2). That fix did
**not** materialize `project/critical-human-proof.json` itself for a fresh
project — only the manifest gate and the check ordering. In the 2026-08-09
Claude test run (a fresh, `signature`-mode project — this repo's own default),
the first `pipeline-state.mjs approve-push` call refused with
`CRITICAL-PROOF-POLICY-KIND-REQUIRED`: no policy file exists yet to declare
that `push` requires a proof at all. The agent tried to write that file itself
and was correctly blocked by `guard-gate-strength.mjs` (an agent may not
declare its own proof requirements). The only remaining path was the full
signed Human-Guard-Override ceremony
(`2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md`)
just to lift the guard blocking that file's creation.

## What it cost, measured

Roughly 12 of the 42 minutes in the session's push-approval phase, 4 of its 8
human terminal commands, 2 Claude-Code-harness classifier denials (blocking
even a read-only `Read` of the guard's own script), and one rejected
sub-agent dispatch the PO explicitly turned down in favor of just stating a
path directly. This is the single largest contributor to that phase's cost.

## Direction

Two independent remedies, not mutually exclusive:

1. **Auto-provision at onboarding.** Since `gates.push_approval` is already
   declared explicitly in `pipeline.user.yaml` (signature or chat) by the time
   onboarding runs, onboarding has everything it needs to also materialize
   `project/critical-human-proof.json` with `requiredKinds: ["push"]` up
   front — the same pattern `materialize-push-threat-model` already uses for
   its own one-shot file. Likely lands in `project-onboarding-v3.mjs`
   (wherever `freshGateChapter` / the manifest seeding already happens) or in
   `runtime-projection-v3.mjs`. Needs a test pinning both `signature` and
   `chat` mode, matching PUSHSEED-2's shape for the chat half.
2. **Collapse the HGO ceremony itself**, per the sibling item's own Direction
   — if that ships, provisioning this file may never need the HGO path for
   the push case specifically, making (1) the higher-leverage fix and (2)
   defense-in-depth for every other guard family that still needs a signed
   lift.

## Related

- `2026-08-09-the-push-gate-is-silent-in-every-consumer-project.md` (closed) —
  fixed the manifest gate and check ordering; this item is the remaining gap
  its own "Not shipped, deliberately" section did not claim to cover.
- `2026-08-08-the-signed-guard-override-has-no-command-that-emits-the-digest-to-sign.md`
  (open) — the ceremony this gap forces a fresh project through.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
