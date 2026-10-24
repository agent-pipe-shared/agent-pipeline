# G28 portable historical audit archive — inert delivery

**Targeted delivery: green in the owned clone; integration and acceptance pending.**
Base: `16c9e1936c623de9b2e8ea2b384b7b93c1cb7ee5`.
No native binding, host observation, dispatch record, signature, or commit
authorship is claimed. No main tracked file or metadata was changed.

## 1. DoD and evidence

- Accepted mapping: Alfred Spec §21.6 R6-4 / AC-175's audit-index clause and
  §22.3 R7-3 / AC-113's tracked bound-artifact clause; ADR-0063's 2026-10-15
  amendment. Other AC-175 clauses remain outside G28. This is an archive for
  historical candidate C, never a C→P qualification or gate pass on P.
- Focused audit-pack suite: **passed**, exact wrapped command
  `node --test plugins/pipeline-core/scripts/audit-pack.test.mjs`, exit 0,
  machine artifact `scratch/clones/g28-portable-evidence/scratch/agent-out/g28-portable-evidence/audit-pack-windows-final.log`
  (5/5). It covers publish to tracked home, fresh clone, committed-byte
  readback, wrong candidate, altered/missing/extra archive files, private path
  refusal, absent review, populated synthetic Critic summary redaction, and
  byte-preserved signed proof. The populated summary is labelled synthetic; it
  is not a forged consumed private receipt or native qualification. The initial test
  run exited 1 on two test-ordering errors, retained at `audit-pack-test.log`;
  the corrected suite is the cited GREEN.
- Focused CLI admission/policy suite: **passed**, exact wrapped command
  `node --test plugins/pipeline-core/lib/guard/audit-pack-command-admission.test.mjs`,
  exit 0, machine artifact
  `scratch/clones/g28-portable-evidence/scratch/agent-out/g28-portable-evidence/source-closure-admission-corrected-green.log`
  (3/3). It covers admitted read-only Source classification at project and
  installed-plugin roots, simulated native Windows relative and absolute scratch
  paths, foreign drives/roots, dot traversal, and POSIX backslash refusal;
  it also covers read-only versus
  mutating routes, foreign script/input, extra argv, wrong public output and
  the existing DevPlan write-policy target. The prior RED captures remain at
  `cli-admission-red.log`, `cli-admission-green.log`,
  `cli-admission-diagnose.log` and `cli-admission-diagnose2.log` in that
  machine-output directory. The final two failed at absolute-plan line 30:
  relative-plan line 29 passed, while a missing `node:path` `relative` import
  was caught as a null admission. The import fix produced GREEN. The later
  Windows-portability control was RED at `windows-path-red.log` before native
  separator normalization, then GREEN at the cited artifact. Actual native
  Windows execution remains **unrun**; this is a portable dialect simulation.
- Source-closure regression: **meaningful RED** on the initial liftable CLI,
  command `node --test plugins/pipeline-core/lib/guard/audit-pack-command-admission.test.mjs`,
  exit 1 at `source-closure-red-corrected.log`; valid `plan` admission passed
  before its Source classification failed. The initial `source-closure-red.log`
  also contains a corrected test-fixture mistake (absolute versus relative
  constant). Existing kernel closure command
  `node --test plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs`
  passed, exit 0 at `source-closure-kernel-green.log` (11/11), including
  GMWKC01 transitive imports and GMWKC03 protected-assets inventory. The
  intermediate `source-closure-import-scan.log` failed only on the two missing
  inventory mentions after the roots were added; that failure was repaired.
- Archive suite rerun: **passed**, command
  `node --test plugins/pipeline-core/scripts/audit-pack.test.mjs`, exit 0 at
  `source-closure-archive-green.log` (5/5).
- Consumer-path suite: **passed**, exact wrapped command
  `node --test harness/scripts/check-consumer-safe-paths.test.mjs`, exit 0,
  machine artifact `scratch/clones/g28-portable-evidence/scratch/agent-out/g28-portable-evidence/source-closure-consumer-green.log`
  (9/9). `git diff --check` exit 0; exact patch reverse-check
  `git apply --check --reverse .../patch.diff` exit 0.
- Quick check: no configured route. Product resource headroom: unknown; no
  project measurement/check artifact was supplied. Integrated Full Verify,
  independent Critic batch and PO acceptance are parent-owned and pending.

## 2. Changed files

- `plugins/pipeline-core/scripts/audit-pack.mjs`: create-only `publish` route
  into `specs/<feature>/evidence/audit-packs/<id>`, explicit Security evidence,
  offline committed-blob/historical-candidate archive integrity readback,
  and public projection that removes local Critic packet IDs after the
  canonical private receipt check. Local pack shape remains unchanged.
- `plugins/pipeline-core/scripts/audit-pack.test.mjs`: isolated scratch fixtures
  and positive/negative fresh-clone controls; existing examiners retained.
- `plugins/pipeline-core/docs/audit-packs.md`: document local versus historical
  tracked archive contract, guarded CLI routes and assurance limit.
- `plugins/pipeline-core/lib/guard/constants.mjs`: register the exact physical
  audit-pack source script in the existing canonical script catalogue.
- `plugins/pipeline-core/lib/guard/command-catalogue.mjs`: admit closed plan
  and verify read requests; route build/publish through existing output policy;
  normalize only native Windows request separators while refusing aliases.
- `plugins/pipeline-core/lib/guard/audit-pack-command-admission.test.mjs`:
  prove exact request shapes, output target, refusals, Windows dialect handling,
  and never-liftable Source classification of the admitted CLI and its delegate.
- `plugins/pipeline-core/lib/guard-maintenance-window.mjs`: add the newly
  trusted read-only CLI and its publication-gate evidence import as kernel
  roots; the existing closure scanner confirms the remaining imports were
  already protected.
- `docs/guard-maintenance-window-threat-model.md`: inventory both new roots
  under protected assets.

Exact complete patch: `scratch/agent-out/g28-portable-evidence/patch.diff`.
Seven tracked source files remain modified and the focused admission test is
untracked in the inert clone. The patch includes all eight paths and applies in reverse cleanly
to that clone. Nothing committed.

## 3. Deliberately not changed

No PRD, Spec, candidate verifier, calibration, private State,
runner receipt, key material, proposed A1/E3 carrier decision, or main file.
The archive commit is never presented as qualified by candidate C's checks.

## 4. Deviation and open items

The first report stopped at a C→P qualification decision. The accepted
tracked-evidence contract permits this narrower archival route without that
decision; `proposal.md` is marked superseded for archival delivery. This
source remains an inert patch pending parent integration. `verify: pending`;
`independent review: pending`; `PO acceptance: open`. No actual feature
approval, Security result, Critic report or portable native provenance was
manufactured. The final archive is only as complete as real supplied evidence.
The fresh CLI phase now includes the protected catalogue registration as an
inert proposal. Focused source tests establish its local route behavior;
they do not claim installed-host enforcement or an end-to-end operator run.
The prior CLI phase exceeded its 35-call methodological allocation at 39
calls; its stop and captures remain in `cli-phase-handover.md`. This separate
Windows-correction phase used 16 of its 20-call allocation. Native Windows
execution and installed guard qualification remain pending. This source
closure is only an inert reviewable proposal: no maintenance window was armed,
no protected baseline or hash pin changed, and no new authority opened.
The source-closure phase used 40 of its 45-call methodological ceiling;
the prior 39/35 CLI overspend remains part of the cumulative history.
