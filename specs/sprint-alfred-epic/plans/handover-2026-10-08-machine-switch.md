# Handover — machine switch, 2026-10-08 (feature `sprint-alfred-epic`, branch `feat/sprint-alfred`)

Purpose: continue the 0.7.0 candidate work on another machine without losing the slicing, rulings, plans or evidence,
and without falling back to the design phase. **Nothing in this handover is PO-accepted.** "Implementation complete"
below means pins green and dispatcher self-verified or Critic-passed, never accepted.

## 1. Where the state lives (and what a push carries)

| Kind | Location | Carried by a push |
|---|---|---|
| Lifecycle state (phase `implementation`, queue revision 31) | `project/pipeline-state.json` (tracked) | yes |
| Plan, slicing, rulings 16–50 | `plans/0.7-execution-order.md` (this folder) | yes |
| Spec / AC reconciliation | `../spec.md`, `spec-ac-reconciliation-2026-10-07.md`, `unstarted-ac-contracts-2026-10-07.md` | yes |
| Design notes | `../design/*-2026-10-0[78].md` | yes |
| Critic records + dispatcher dispositions | `../evidence/critic-2026-10-07/*.md` | yes |
| Toil log (T1–T63) | `../evidence/toil-log-2026-10-06-07.md` | yes |
| PO question list (N1–N15) | `po-open-questions-2026-10-07-night.md` | yes |
| Host checklist H1–H12 | `candidate-host-checklist-2026-10-08.md` | yes |
| Dispatch records, run evidence, Critic briefings and notes, commit messages, builders, probes (everything modified since 2026-10-05) | git-ignored `evidence/`, `scratch/` → **bundled** in `../evidence/transfer-2026-10-08/bundle-{scratch,evidence}.json` (1049 files; machine paths redacted, nothing dropped; restore with its `unpack.mjs`; `MANIFEST.md` lists the few rebuildable items not bundled) | yes (bundle) |
| Tranche-1 ENVDUMP lane (staged in the index, not committed) | `../signed-package/tranche-1/envdump-staged-2026-10-08.patch` (lane blob `93aad15d0`, `evaluate.mjs` blob `3c3e447da`) | yes (patch) |
| `.claude/settings.json` local modification | working tree only (PO question N13) | **no** |

## 2. Resume on the new machine

1. Fetch the branch and check out `feat/sprint-alfred` at the pushed commit; install the plugin per memory note
   "Repo provenance & plugin install" (local marketplace from this branch).
2. Re-stage the tranche-1 lane: `git apply --cached specs/sprint-alfred-epic/signed-package/tranche-1/envdump-staged-2026-10-08.patch`
   and `git checkout-index -f -- plugins/pipeline-core/lib/guard/env-dump-lane.mjs plugins/pipeline-core/lib/guard/evaluate.mjs`;
   check `git ls-files -s` shows the two blob ids above.
3. Restore the ignored working material: `node specs/sprint-alfred-epic/evidence/transfer-2026-10-08/unpack.mjs`
   (writes `scratch/` and `evidence/` back to their original paths; Critic briefings reference `scratch/briefings/`,
   `scratch/critic-input/`; the tranche-1 builder is `scratch/T1/`).
4. Read [`next-actions-2026-10-08.md`](next-actions-2026-10-08.md) — the ordered work queue.
5. Session start: `/pipeline-core:pipeline-start` (bootstrap), then read `plans/0.7-execution-order.md` from "Rulings
   39–42" onward and this file. The continuity projection must report phase `implementation`; if it reports design,
   stop — that means `project/pipeline-state.json` did not arrive at the pushed commit.

## 3. Package status (2026-10-08 ~05:00Z)

| Package | Done (commits) | Open, in order |
|---|---|---|
| ENVDUMP (tranche 1) | pins `069813bf3`, `189e6a33e`; lane staged with T1-F1 fix | ENVDUMP delta Critic (running at handover); T1-F2 backlog item (refusal by effect) |
| R7-6-P (tranche 1) | post-image `d0c820c66` (dispatcher-verified) | run evidence at package apply |
| Verify registrations (tranche 1) | — | author the `verify-suites.json` post-image for every suite green or typed-skip (list in the execution order "Tranche-1 note") |
| AC-6 | `5ae19bbd7`, `88ec01bc7`, `1e475885a` (design), `0381ea062`, AC6-T3 `417d27630` (5 RED) | AC6-F3 (ruling 45); promotion record reader (N12); writer-case `/var/tmp` on win32 (AC6-F4) |
| AM (agy central snapshot) | `842470e8f`, `c503adf8a`, `32e327d9f`, `298c23f96`, `a29a3e92b` | ruling 50: AM-W wiring (pins first), AM-T4 pins, fixes D2–D4; spikes H10 |
| AL (Codex Critic lane) | `cb03e8ae3`, `a3af12b0c`, `9a317fa56`, `091a6f70e`, `543ad7123`; WINMF-T `f07c41113` (RED) | WINMF-F (win32 `directoryPathChain`) → AL-F2 (rulings 35/35a) → AL-2 via H9 |
| RV (recovery, AC-33) | S1–S5 incl. `e8f2e0abf`, `02aa75cd4`, `56234d70c`; RV-S5-T2 `6d5804e8c` (RED); S7 `e15aa1797`, `cfe695a5d` | RV-S5-F2 (ruling 44; needs a `repositoryRoot` input — the T2 author's choice, ratify or rename); RV-S7-T2 + F3 (ruling 49); RV-S6, S8–S11 |
| PR-S1 (gh classifier) | `d34d89da1`, `5b67e05cb`, PR-S1-T3 `86d9a68de` (5 RED) | PR-S1-F3 (ruling 43), then self-verify; wiring PR-F3 |
| GITCLS | `f1bdda611`, `9bc217fe9` (Critic PASS) | ruling 48: GITCLS-T2 + F2 (`env -S` with trailing operands) |
| EVID | `ab062267e`, `f1d9b0f91`, `be0bd4a91` | 4 pre-existing win32 redaction failures → backlog item |
| FSYNC | `67f876811`, `ec96b8a3e` — implementation complete | — |
| AC-34 | `116f9e232`, `eb7cd7e63` — implementation complete | POSIX run (H12) |
| SEC-PORT | `467cdd6c3` | semgrep timeout (H11) |
| R5 (`--answers-file`) | design `de3c64d56` | R5-T0 stopped: the note leaves the answers code-set option unnamed → ruling needed (proposal: `codeSet: "answers-file"`; `expectedSha256` stays the digest option; `maxBytes` alone keeps `INTAKE-CAPTURE-TEXT-FILE-*`), then R5-T0 → F1… |
| R4 (role-route preflight, AC-29) | design `15813bfac`, S0 `68f57fc71` | T0 (13 cases), S1–S5; N15 |
| R6 (audit index, AC-31) | — | design note (`harness/scripts/pipeline-state.test.mjs` is TP-5) |

Rule for every package: one full Critic plus at most one delta, then dispatcher self-verify (memory note). Critic
dispatches copy `templates/prompts/critic-review.md` Phase A verbatim; spec paths from `git ls-files` (toil T62).

## 4. Tranche signing (PO decisions AS, AT, AY)

- **Tranche 1 (signed this morning):** the R7-6-P post-image of `plugins/pipeline-core/scripts/pipeline-state.mjs` only
  (one-file signed quality package; builder `scratch/T1/build.mjs`, check `scratch/T1/check.mjs` — copies in the transfer
  folder). After its commit the candidate is stamped (`plugin.json` version `0.7.0+claude.<UTC>.<package commit>`).
- **Tranche 2 (new machine):** ENVDUMP lane with the ruling-51 fix (re-stage from the patch, pins T1-T3, fix, self-verify)
  plus the Verify registrations (`../signed-package/tranche-1/harness/verify-suites.json` post-image, commit
  `dcf6395cd` — re-check that every suite it registers is green or carries typed skips before building).
- `.claude/settings.json` is committed as is (AS).

## 4a. Open structural item (PO remark 2026-10-08)

Only `scratch/` and real user or machine data (telemetry, `.pipeline/machine-local.yaml`, private overlay,
`.claude/settings.local.json`, `.env`, keys) should be git-ignored. `/evidence/` (dispatch records, run evidence) is a
work product and is lost on a machine switch today; the transfer copy is the stop-gap. Next: an ADR-0063 amendment plus
a guard that refuses tracked evidence naming a machine path (the 28 skipped files show the redaction is incomplete), then
drop `/evidence/` (and review the blanket `*.jsonl`) from `.gitignore`.

## 4b. Working rules a fresh session must follow (from this machine's session memory and PO instructions)

- PO goal: build and provide the next sensible local 0.7.0 candidate; scope = all 37 ACs, every open backlog item and
  every triage §6 item (AH, AI). Language with the PO: German; documents: English (ADR-0011).
- Critic: one full Critic per package plus at most one delta Critic on the fix diff, then the dispatcher self-verifies
  (PO 2026-10-07: four rounds was "fatal"). Critic briefings from `templates/prompts/critic-review.md` verbatim.
- Goldfish tiers: `goldfish-implementor` (sonnet) by default; `goldfish-mechanic` for trivial edits; `goldfish-deep`
  only for real design latitude or test authorship of new contracts. Model named explicitly on every dispatch.
- QG-04: test-only dispatches commit RED pins; a fix dispatch never edits tests; test changes need an explicit ruling.
- Parallelism: keep 10 dispatches running when work allows; tool calls one at a time inside a dispatch; no full verify
  on the Windows host — run single test files; record friction in the toil log.
- Signing: tranches, each followed by a stamp so the PO can install it; stop all dispatches before a ceremony and never
  change the tree between seeding/building and the PO's signature.
- Hard limits: signatures only by the PO in an attended terminal; never read keys, the real home or the machine plane;
  push and release stay with the PO; never force-push, stash, reset, `--amend` or skip hooks; no secrets or machine
  paths in commits; never run `env`/`printenv`; trailers only `Dispatch: …` (+ `Commit-Act: orchestrator` when the
  Elephant commits a Goldfish's files) and `AI-Assisted: true`, no co-author or session trailers (GIT-03).
- Repository conventions: each epic on its own branch; Windows, Linux, WSL and macOS are first-class platforms (Docker
  out of scope); every block should be agent-fixable — a human only for real signatures; never write to the public
  repository under the PO's personal account (hand such writes to an authorized account).
- Commit mechanics: message file in `scratch/`, `git add <paths>` then `git commit -F <msg> -- <paths>` as separate
  calls; closed shell grammar (no pipes, `;` or redirects); `git grep` instead of Grep/Glob over directories.

## 5. Push (signature mode; `docs/push-release-flow.md`)

Order is load-bearing: commit this handover **before** the signature; commit nothing between `approve-push` and the
push. Agent: `push-init.mjs` (fast path to the signature step) and `approve-push`; PO: the one `authorize-critical`
command in an attended terminal; agent or PO: `git push origin feat/sprint-alfred:refs/heads/feat/sprint-alfred`.
The remote target and account rules stay with the PO (memory: no public write as the PO's personal account).
