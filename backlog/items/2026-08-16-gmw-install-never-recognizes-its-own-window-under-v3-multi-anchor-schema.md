---
schema: pipeline.backlog-item.v1
id: pipeline.gmw-install-never-recognizes-its-own-window-under-v3-multi-anchor-schema
type: defect
owner: pipeline
status: open
created: 2026-08-16
source: "Live GMW ceremony during the Nova A AFK-session bootstrap, this session (2026-08-16) -- guard-maintenance-window.mjs install wrote a well-formed, correctly-signed window record, but the immediate re-read (and every subsequent status/guard check) reported absent."
---

# GMW install writes a valid window record that its own read path immediately reports absent

## Description

`guard-maintenance-window.mjs install` (and the `currentGuardMaintenanceWindow`
re-verification it calls internally to build its own return value,
`plugins/pipeline-core/lib/guard-maintenance-window.mjs:586`) reads the trust
anchor via `readCriticalHumanProofPolicy(repo.root).trustAnchor` — the
**singular** field from the pre-v3 `critical-human-proof.json` schema. Since
the round-1 Critic fix earlier this session (2026-08-16, recorded in
`docs/state.md`'s "0.5.5 local test candidate" entry), this repository's
`project/critical-human-proof.json` carries the **v3 multi-anchor schema**:
a `trustAnchors` **array**, with `trustAnchor` now permanently `null`.

Confirmed live: `install` itself succeeds (it accepts an explicit
`--authority <external-trust-policy.json>` and writes the window record with
a verified signature), but the very next line calls
`currentGuardMaintenanceWindow`, which reads `policy.trustAnchor` (always
`null` under v3) and fails the `if (!policy.ok || policy.trustAnchor === null)
return { status: "absent" }` check — so `install` itself reports
`{status: "absent"}` even though it just wrote a valid file, and every later
`status` call and every GS-6/TP-* guard check does the same. The window is
functionally **dead on arrival**: no signature, however correctly produced,
can ever be recognized as active while `critical-human-proof.json` stays on
the v3 schema.

## Triggering situation

Live ceremony this session: `prepare` → PO `sign-intent` → `install
--authority <external trust-policy.json>` all succeeded individually (each
returned `ok: true` with no thrown error), but `guard-maintenance-window.mjs
status` immediately after reported `absent`. Diagnosed by importing
`readCriticalHumanProofPolicy` directly against the live
`project/critical-human-proof.json`: `{trustAnchor: null, trustAnchors: [{
keyReference: "local-po-key", publicKeySha256: "f28988b2…" }]}` — the correct
anchor is present, only under the plural field GMW's install/read path never
looks at.

## Affected artifact

`plugins/pipeline-core/lib/guard-maintenance-window.mjs` — both read sites:
`installGuardMaintenanceWindow`'s default-authority branch (script CLI layer,
`scripts/guard-maintenance-window.mjs:126-135`, only reachable when
`--authority` is omitted, so this branch is *also* broken but was not the one
exercised live) and `currentGuardMaintenanceWindow`'s trust-anchor read
(`lib/guard-maintenance-window.mjs:636-640`, exercised on every single
read including the one `install` itself performs). Push approval's own
`authorizeRecordedPush` (`lib/critical-action-authorization.mjs`) and
`po-human-approval.mjs` already handle the v3 `trustAnchors` array correctly
(iterate/first-match) — GMW's trust-anchor read was never updated to match
when the v3 migration landed elsewhere in the same session.

Note the *file* `lib/guard-maintenance-window.mjs` is itself one of the
hardcoded `NEVER_LIFTABLE_KERNEL_PATHS` (ADR-0058 point 3) — a GMW window can
never cover editing this file, by design.

**Correction, 2026-08-17: the sentence that used to stand here ("a fix here
can only land through an isolated-worktree Goldfish dispatch... never
through a same-session Edit under an active window") was wrong, and blocked
this fix from being dispatched for a full session.** It conflated two
different things: `NEVER_LIFTABLE_KERNEL_PATHS` governs which paths a GMW
*window* can waive — it says nothing about whether the file can be edited by
an ORDINARY Goldfish dispatch with no window involved at all.
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` is on the exact same
list and was successfully edited twice via ordinary, non-isolated Goldfish
dispatches earlier the same session this item was filed in (commits
`15cf0e58`, `a27a2ce8`, `bf8803ed`) — direct, empirical proof the file class
is normally editable. Confirmed separately: neither
`lib/guard-maintenance-window.mjs` nor `scripts/guard-maintenance-window.mjs`
appears in `project/guard-config.json`'s `protectedTestPaths` (TP-1..TP-10)
either. There is no technical obstacle; dispatched as `NVA-GMWFIX-1` (ordinary
goldfish-deep, no isolation, no window) once this was noticed.

## Proposal

Read `trustAnchors` (array) with `trustAnchor` (singular) kept only as a
legacy fallback when present, mirroring the narrowing already done in
`authorizeRecordedPush`/`po-human-approval.mjs`: accept a signature whose
`{keyReference, publicKeySha256}` matches ANY entry in `trustAnchors`. Apply
at both read sites (`currentGuardMaintenanceWindow`'s trust-anchor lookup, and
the CLI's default-authority branch in `scripts/guard-maintenance-window.mjs`).
Add a focused regression fixture: install/read a window under a
`critical-human-proof.json` fixture using the v3 `trustAnchors` array only
(no singular `trustAnchor`), asserting the window reads back `status:
active`, not `absent`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — dispatched as `NVA-GMWFIX-1` (goldfish-deep, no isolation), 2026-08-17.
- **Rationale:** correctly diagnosed, correctly scoped fix (mirror the already-correct `trustAnchorsFor`/`verifyAgainstTrustAnchors` pattern already used elsewhere in the same codebase); the file is guardrail-class but not actually blocked from ordinary editing (see correction above).
- **Assignment (if accepted):** this AFK block, in flight at time of writing.
- **Date:** 2026-08-17
