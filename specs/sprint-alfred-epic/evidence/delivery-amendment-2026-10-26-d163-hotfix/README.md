# Delivery amendment 2026-10-26: D163 hotfix candidate

Snapshot: [`snapshot.json`](snapshot.json), previous: [portable closure 2026-10-25](../delivery-amendment-2026-10-25-portable-closure/README.md).

The PO applied the nineteen held patches of the C29 row as one operator commit `9ce6c2361` (D163) and stamped
`0.7.0+<runner>.20261026134650.9ce6c23` in `689116c57`. The Coordinator verified that the commit's tree is byte-identical
to HEAD `10e8573b5` plus the nineteen patches in order, and that both local marketplace copies equal the repository plugin
tree (2219 files). Claude, Codex and Antigravity installs report the new version.

**221 items · 197 at 75 · 21 at 50 · 3 at 25 · 24 below 75 · index 71.95%** (row amendment, 2026-10-27, PO tile decision: three rows whose only open entries are a counted Verify run, the Critic and PO acceptance move 50 to 75 as technically delivered: `pipeline.nongit-retirement-reader-calls-inaccessible-controller-helper`, `pipeline.onboarding-init-greenfield-matrix-is-serial-and-slow`, `pipeline.onboarding-test-runner-reports-async-pass-before-settlement`; analysis amendment, 2026-10-27: eight analysed rows move 25 to 50, evidence is the committed recon notes in `../recon-2026-10-27` and, where a part is delivered, held patches that are committed but not applied; row ids: preflight prerequisites, late review unit, brownfield architecture gate, missing docs/adr, fitness class 6, half-moved feature directory, draft guard recovery wrappers, PF-79; D173, 2026-10-27: PF-80 `pipeline.critic-finalizer-cli-reports-scf-internal-without-the-cause` moves 25 to 75, held patch D173 applied in operator commit `e3f0d7d03`, installed in the stamp `e562ae955`; D172, 2026-10-27, below; D167 adds the P0 row `pipeline.critic-diagnostic-evidence-producer-and-registrar-disagree-on-the-location`, PF-78; previous 207 items, 184/17/6, 71.5%; after D165 210 items, 72.02%).

D165 adds two P0 consumer blocker rows at 25 for an interim candidate:
`pipeline.consumer-push-blocked-by-late-review-unit` and `pipeline.brownfield-architecture-gate-never-passes`.

D166 adds seven rows from the Toolbox consumer handovers (Windows, build `…152532`): P0
`pipeline.dispatch-authority-store-check-fails-on-windows` (D25), `pipeline.windows-private-state-check-counts-acls-inherited-from-above-the-repository`
(D6, at 50: held patch D165-S7a applied in `1bcce7add`, bootstrap finding S7b open) and
`pipeline.design-course-and-registrar-disagree-on-the-feature-directory` (D7, D15, D16, D17, D24); P1
`pipeline.missing-docs-adr-directory-blocks-implementation-entry` (D8),
`pipeline.fitness-class-6-blocks-documentation-modules-without-a-verification-entry` (D9),
`pipeline.half-moved-feature-directory-locks-every-shell-and-source-write` (D14, D18) and
`pipeline.draft-guard-blocks-the-sanctioned-recovery-wrappers` (D21, rest of D3). Counts: **217 items · 190 at 75 · 16 at 50 · 11 at 25 · 27 below 75 · index 70.62%**.
D2, D3, D4, D5 stay in the existing brownfield row (status table in its backlog item); P2/P3 are backlog only.

D164 adds one P1 row at 25, `pipeline.preflight-establishes-runner-prerequisites` (item
`backlog/items/2026-10-26-preflight-establishes-runner-prerequisites.md`): no existing row covers establishing node and
the scanners with the user; `pipeline.greenfield.g34.scanner-summary-truth` (75) covers only the summary wording.

| Row | From | To | Evidence |
|---|---:|---:|---|
| `pipeline.greenfield.r2.onboarding-identity-and-actor-reuse` | 25 | 75 | `r2-identity-actor-reuse` patch and notes, helper `82f781b08` |
| `pipeline.greenfield.r2.behavioral-evidence-oracle` | 25 | 75 | direct commit `45612a7bd` (recorded in State, not yet in a snapshot) |
| `pipeline.greenfield.r2.critic-validation-transaction-recovery` | 50 | 75 | `r2-critic-txn-owner-recovery` patch and notes |
| `pipeline.greenfield.r2.windows-lock-release-postcondition` | 25 | 75 | `r2-windows-session-locks` patch and notes |
| `pipeline.greenfield.r2.windows-session-lock-owner-recovery` | 25 | 75 | `r2-windows-session-locks` patch and notes |
| `pipeline.greenfield.g33.post-close-push-continuity` | 50 | 75 | `g33-damaged-state-recovery` patch and notes |

D172 (2026-10-27) applies the PO rule that 75 counts when the work is technically delivered in the candidate: Full Verify,
Critic, native Windows runs and PO acceptance are the gates after 75. Rows moved, each dropping only its `agent` entry:

| Row | From | To | Evidence |
|---|---:|---:|---|
| `pipeline.dispatch-authority-store-check-fails-on-windows` (D25) | 25 | 75 | held patches D166 and D169, operator commit `304365b68`, installed `0.7.0+claude.20261026222010.17e002a` |
| `pipeline.critic-diagnostic-evidence-producer-and-registrar-disagree-on-the-location` (PF-78) | 25 | 75 | held patch D167, same commit; the consumer reports the location error gone. Documentation follow-up not delivered |
| `pipeline.windows-private-state-check-counts-acls-inherited-from-above-the-repository` (S7b) | 50 | 75 | held patch D168, same commit |
| `pipeline.design-course-and-registrar-disagree-on-the-feature-directory` (D7) | 25 | 50 | D170 `17e002a67` (installed), D171 `bff5c444e` (source only, not yet stamped); Wanted 2 to 4 open |

Three rows join at 25 from the Glossover session (installed `…20261026222010.17e002a`): P0
`pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have` (PF-79), P1
`pipeline.critic-finalizer-cli-reports-scf-internal-without-the-cause` (PF-80) and P1
`pipeline.verify-for-an-older-commit-demands-package-lock-in-a-pnpm-project` (PF-81). Native Windows behaviour of D25 and S7b is not measured.

75 means focused Source readiness. Each moved row drops only its `agent` open entry; native-host, Verify/Security,
frozen Critic and PO acceptance stay open. Native Windows behaviour of the two Windows rows is not measured.

Not in this snapshot: row 208 `pipeline.push-approval-record-always-trails-the-signed-commit` exists only in the
off-machine commits `64dbc35d0`/`6f089c41b` (see `docs/state.md`). D161 (`d161-push-close-fold`, applied here) addresses
it; it joins at 75 when those commits are merged. Report 05 minors PF-60, PF-63, PF-66, PF-68 and PF-70 map to existing
ACs and remain open.
