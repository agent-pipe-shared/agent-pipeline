---
schema: pipeline.backlog-item.v1
id: pipeline.candidate-22-open-follow-ups
type: defect
owner: pipeline
status: open
created: 2026-11-09
source: Elephant triage of the Claude and Codex greenfield reports and their loop chapters while building candidate 22; the chain is in specs/sprint-alfred-epic/evidence/held-patches/c22-chain/
sprint: alfred
done_when: manual
---

# Candidate 22: what was built only partly, what was not built, and what the next greenfield must recheck

## Description

Candidate 22 (40 patches, stamp `ef16e1b86`) carries the P0 to P2 findings of the Claude report (CGR-01 to CGR-22) and the cheap loop topics of both reports. This item keeps what stayed open so none of it lives only in chat. Status: implementation complete, PO acceptance pending. No Full Verify and no Critic ran on this state, and none of the close changes has run in a live close.

## PO decisions of 2026-11-09 for the follow-up build (22b)

- **CGF-06:** wire the classifier narrowly. A scanner finding is discounted only when the file carries a known Pipeline schema and the finding lies in a digest field. Everything else keeps blocking.
- **CGF-08:** when the two disagree, the blocking check alone decides the gate. The stored view stays beside it as report-only and open, with its date.
- **CGR-13:** commits stay as they are. The close result and the audit bundle count product and evidence commits separately.
- **CGR-19:** one narrow command moves `repositoryMode` from `local-only` to `remote-tracked`, only with a configured remote. Every other direction stays on the guard-override route.
- **Read grammar:** combined short flags are admitted by checking each flag against the existing list.
- **Recursive grep (PO decision on measured reach):** `grep -r` is admitted through its own screen, because the existing recursive screen follows the reach of `rg` and `grep -r` also reads ignored and hidden files. The common shapes count (`-rl`, `-rE`, `--include`), since the goal is fewer wasted turns. `-R` stays refused.
- **Stay in 0.7.1:** CGF-16, CGF-24, CGF-25 with CGF-01 (its proof and final-evidence part moved into candidate 27, D238; the portable package stays), CGF-26, CGF-36, the CGR-07 queue, straight-run tests 1, 2, 3 and 5.

## Built in 22b (implementation complete, PO acceptance pending)

The chain is in `specs/sprint-alfred-epic/evidence/held-patches/c22b-chain/`. Only the affected suites ran. No Full Verify, no Critic, no live run.

- **CGF-06:** a scanner match is discounted only for a known Pipeline schema and a digest field, and the count is printed.
- **CGF-08:** the blocking check decides. The stored view is shown beside it as report-only with its date, in the orientation and in Verify.
- **CGR-13:** the close result and the audit bundle count product and evidence commits separately.
- **CGR-19:** `repository-mode-promote.mjs` plus a stateless commit-hook admission for exactly that one token in both calibration twins. Installed hooks need a refresh after the install. The command is not reachable in lifecycle draft because it has no catalogue row. An unrecorded architecture adoption request created before a promotion goes stale (`ADOPTION-AUTHORITY-INPUT-CHANGED`).
- **Read grammar:** a short-flag cluster of `rg` and `grep` is admitted when every letter is admitted on its own and takes no value.
- **Recursive grep:** `grep -r` with `-l`, `-w`, `-s`, `--include`, `--exclude` and `--exclude-dir` is admitted behind its own screen, which visits every entry and refuses a secret name, a `.git` that is not excluded and more than 10000 entries. A refusal by the screen names one admitted spelling. The screen took about 170 ms on 10000 entries (WSL2, warm cache). Not run: Windows-native and BSD `grep`.
- **LOOP-A1:** a round-trip test exists and found no defect. It runs on Linux. Execution of the printed command under cmd.exe and PowerShell is not proven, and some kinds are covered only through the library leg.
- **Preflight and compact wording:** the cloud-folder key warning is gone and the false registry alarm after a compact is fixed.

## Candidate 23 scope (PO direction of 2026-11-09)

There is no interim candidate. The findings of the live greenfield runs on 22b and the three runner reports all go into candidate 23. Toil that occurs only minimally is not built: a one-turn refusal the agent recovered from itself.

- **Design reviewer identity on Codex:** stays recorded as `unknown`, visibly. The design reference tells the agent to omit the field.
- **Second readiness round NOT READY:** stays as it is. The agent corrects the sources and discloses the unreviewed change at the approval.
- **`--help` in a ready session:** the guard admits it and the script decides. Most scripts print their usage, but a few really run (`rotate-handover-sections.mjs`, `repair-map.mjs`, `check-backlog-done-predicate.mjs`). Those get a real help branch in 23.

## Built only partly

- **CGF-03:** the critical profile shows a named notice and the existing exception route. A real Codex CLI session prints the conditional form because the CLI takes no receipt flag. Whether every report producer avoids a stronger word was not checked.
- **CGR-18:** an unchanged threat model blocks only in the critical profile (`PUSH-THREAT-MODEL-TEMPLATE-UNCHANGED`). Other profiles get a notice.
- **w303:** the acceptance record is appended with an amendment rebind. Open checks come from `--open-checks` plus a standing one. A live close is not proven.
- **CGF-22, CGR-15:** text only.

## Measured, not built

- **CGF-11:** the actor-label guidance was not built.
- **LOOP-A4:** dispatch artefacts under `.git/` were not built.
- **Lineage independence:** `lib/critic-review-lineage.mjs` writes `lane.independent: true` unconditionally and `lib/critic-review-lineage-core.mjs` rejects anything else. Whether a fallback round reaches that write was not traced.
- **Lifecycle draft:** `repository-mode-promote.mjs` needs a catalogue row to be reachable there.

## Found while building 22b

- A host commit stops with `AGY-HOST-COMMIT-PATH-MISMATCH` when a re-dispatch writes the same deliverable paths as a stopped dispatch whose files are still untracked. The second dispatch is then not delivered by the host, and the Elephant has to commit those deliverables.
- A hand-typed return with a misspelled key stops with `NGHR-FINAL-SHAPE` after the work is finished. The work is intact, but the host commit is lost.
- `rg needle <dir>` is refused as a whole when the tree holds a secret-named file that `rg` would not read, such as a hidden `.env`. The same strictness also covers positive file filters such as `-g '*.key'`, so narrowing it needs its own design. Measured 2026-11-09.
- `lib/node-sandbox-probe.mjs` reports `ready: false` for a version-manager `node` even when it found a stable system `node` of the same version, and the hooks start `node` through `PATH`. PO decision 2026-11-09: fix it with the next candidate. Report ready when a stable `node` with the same major version is found, warn with both versions when they differ, keep today's warning when none is found. How Antigravity hooks start `node` was not established.
- The commit helper of the clone route stages everything. Carried slices left uncommitted land in the next commit with the wrong message.

## Accepted risk

- **w307:** a single unreachable foreign Antigravity descriptor is inferred as the session's own. It is labelled `inferred-single-antigravity-descriptor` and affects only the status `unavailable`. The `ls-files` probe runs for 4 s after a 4.5 s deadline.

## Recheck in the next greenfield

- **LOOP-A3:** `verifyTestInventory` and `antigravity-native-dispatch-consume.mjs` do not exist in the tree. `FCA-PACKAGE` comes from `lib/feature-close-audit-preflight.mjs`.
- CGF-17 and CGF-18 from the Codex report item.

## Behaviour that stays by design

- **CGR-10:** `catalog-unavailable` is expected outside the Pipeline repository and is labelled, with the rules shown.
- **CGR-09:** the marker punctuation is delivered. "PASS with briefing note" stays a deliberate rule.
- **CGR-03:** the count is the number of files in `binding.unreviewedSourceDelta`.
- **CGR-24, CGR-25, CGR-28, CGR-30, CGR-32:** judged no build. CGR-28 and CGR-30 go with the 0.7.1 export.
- **CGR-08, CGR-11, CGR-26, CGR-33, LOOP-A6, LOOP-A8:** verified, no change needed.

## Build notes

- Patch 40 of the chain was aligned by hand with the applied tree, because the build clone never runs the reader-input sync. A re-export overwrites that edit.
- The chain has three commits with several concerns: `a47bfbd3f`, `6fa9369d0` and `ccfa24643`.
- The Reader-review policy digest changed in this chain, because an evidence-only commit no longer needs its own review round.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** the PO asked on 2026-11-09 for every finding to be secured and worked through, with only very expensive points moved to 0.7.1.
- **Assignment (if accepted):** the PO tile on CGF-06, then candidate 23 or 0.7.1 per the greenfield results.
- **Date:** 2026-11-09
