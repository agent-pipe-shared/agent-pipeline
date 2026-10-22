---
schema: pipeline.backlog-item.v1
id: pipeline.governance-scope-rejects-readonly-host-git-control
type: defect
owner: pipeline
status: open
created: 2026-09-29
done_when: manual
sprint: alfred
source: "Complete original onboarding run and physical host-layout contract analysis, 2026-09-29."
---

# Governance enrollment rejects the supported readonly host Git control mount

## Confirmed finding

Two original onboarding callbacks fail for the canonical Codex host-managed
layout: an empty, nonsymlink, nonwritable `.git` control directory. The onboarding
layout owner already recognizes this physical host capability. The new shared
governance reader instead treats the failed local Git probe as unavailable and
cannot establish the expected first intake/enrollment route. Replacing this
fixture with writable local Git changes the contract and is not a correction.

The full original 184-callback execution stopped at its deadline with 143 PASS,
8 FAIL and 33 unobserved. These host failures are observations from that run;
the incomplete run is not a suite PASS. Manifest:
`scratch/0.7-onboarding-fixture-source-failure-repair-20260929/full-184-after-fixes/manifest.json`
SHA `3472d2fb8993458dc1d14371ce8774ff046f567ba0502c1f4b5452db9b23e59a`.

## Correction boundary

Reuse the existing sealed physical host-layout recognizer, selected-root private
history paths and governance decision store. Bind root/mount identity to the
existing branded apply transaction. No local Git initialization, chmod, public
capability override or new authority/schema is permitted.

Fresh host enrollment must work without fabricating plan approval. Declined or
corrupt retained host history must remain a typed recovery requirement. Recovery
uses the existing external operator route for the same selected root; it must
not silently erase history or imply a local retirement capability exists.

## Acceptance

- Both original host callbacks pass against actual corrected Source.
- Fresh/no-history and persisted decisions remain root bound; mount drift,
  aliases, writable/nonempty near misses and corrupt history fail closed.
- Existing local Git and non-Git history assertions remain intact.
- No `.git` writes or false candidate/native acceptance claims are introduced.

## Triage — implementation tracking

The implementation design is frozen in
`scratch/0.7-host-managed-governance-integration-20260929/design.json`, SHA
`f9d805471e957902c4aae847a32c8659826536052501480b3f2322afa77431dd`.
Source delivery and focused qualification are in progress; this item remains
open until its candidate-bound acceptance is verified.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — Run the two original onboarding host callbacks on a real Codex host-managed readonly .git mount; native win32 cannot manufacture the readonly directory
  On Linux/WSL a readonly empty .git is manufactured with chmod 0555, which is how the AC-188 pin builds it. Run pins/governance-scope-rejects-readonly-host-git-control.test.mjs plus the two original callbacks in lib/project-onboarding-v3.test.mjs (216 PASS already counted 2026-10-22 for the sibling snapshot item) with 0 skip. Residual: a literal Codex-managed mount is a host property, covered by the install checklist, not by this clause.
