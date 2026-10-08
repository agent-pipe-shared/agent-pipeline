# Critic TOILRES-D2b a1 — delta review of the toil-resolution design note (2026-10-09)

- **Review object:** `03600b7de` against `a78507b41` (one file, `specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md`).
- **Route:** requested `claude-opus-5-5`, observed `claude-opus-5-5`. Effort was not observed.
- **Verdict: FAIL.** Two major findings and one minor.
- **Prior findings a1 F1–F3:** F1 and F3 are closed. F2 is closed in structure; its residual coverage is the new F-1 below.

## Findings

| ID | Sev | Finding | Evidence | Elephant disposition |
|---|---|---|---|---|
| F-1 | major | TR-S2 does not cover every lane, yet §3.5 says literal key paths are refused on the execution lane. Gaps: (1) The lane is defined by `devplan-shell-lane.mjs:122-149`, which maps only `node`, `python`/`python3` and `bash`/`sh`/`dash`/`zsh`. (2) TR-S2's path extraction and its `-T` corpus cover only interpreter forms. (3) Two lanes the note names itself fall outside both. One is raw `openssl pkeyutl -sign`; only "the `node -e` half" is covered. The other is the prescribed `wsl.exe -e bash -lc "…"` route with its `/mnt/<drive>/` spelling (toil T78, T85). (4) Neither lane is in the residual register; RS-1 covers only computed or obfuscated paths. Not verified: whether the ready-state grammar admits `wsl.exe`, `openssl` or `cp`. | note :146, :160, :195, :203, :208-213, :219, :223, :252; `lib/guard/devplan-shell-lane.mjs:122-149`; toil log L83, L89 | **accepted** → revision TOILRES-D2c. Either extend TR-S2 to every lane the grammar admits (measured), or register each remaining lane with owner and expiry. Correct the §3.5 closure claim. |
| F-2 | major | The `Dispatch: TOILRES-D2b-20261008 (goldfish)` trailer is not bound by the record. The record shows `outcome: in-progress`, `commits: []` and `changedFiles: []`. | `git show 03600b7de`; `evidence/dispatch-record-TOILRES-D2b-20261008.json`; agent-obligations §6 | **accepted** — Elephant process defect, toil row T88 (see below). Cure: TOILRES-D2c writes the file itself under its own bound record. |
| F-3 | minor | RS-1's barrier column ("encrypted key plus attended terminal") protects only the PO signing key. For credential-store and machine-plane targets, only OS permissions remain, and the register does not say so. PO decision 5 would set owner and expiry on a barrier that does not exist. | note :155, :203, :210, :283 | **accepted** → revision TOILRES-D2c. Split RS-1, or state the per-target barrier. |

## F-2 fact note (Elephant)

TOILRES-D2b was stopped by the T87 gate outage. Its Write of the note was refused with `DWP2-PHYSICAL-OR-GIT`, and it left a complete draft under `scratch/toilres-d2b/`. Its record says explicitly that the Goldfish trailer is valid only if the record is made terminal with `changedFiles` covering the path; otherwise the commit must use an Elephant trailer or a new task id.

The Elephant copied the draft and committed it with the Goldfish trailer plus `Commit-Act: orchestrator`, without making the record terminal. It did the same with ADR0085-D (`1a101a866`, Critic ADR0085-D a1 F3).

No commit-time check caught either case. That is toil row T88.

## Not examined (budget or tool refusal)

- the QG-06 and GIT-04 texts;
- the D2-A..E claims;
- the RED-pins claim for `83083a070`;
- the `hooks.json` line claims;
- whether the grammar admits `wsl.exe`, `openssl` or `cp`.

T87 was added after the review object, so it is input for the revision.
