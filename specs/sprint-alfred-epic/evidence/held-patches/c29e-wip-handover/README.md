# Candidate 29e — work-in-progress handover for the PC switch (2026-11-14)

**Status 2026-11-14 (second machine): EXPORTED and REHEARSED, NOT applied, NOT stamped.** The deliverable is
`../candidate29e/apply-candidate-29e.sh` (25 patches). Read "Result of the second session" at the end of this file; the
`chain/` folder and the steps below are the superseded WIP state (its apply script does NOT apply: `docs/state.md` changed
on main after the chain base). Main is at candidate 29d (applied `fe117d6e9`, stamped `c970646cd`, installed on the Claude runner of the
first machine; Codex/Antigravity runner updates not verified).

Candidate 29e is the final candidate of the 29 line (PO goal "Kandidat 29 finalisieren"; PO 2026-11-14: "everything,
Trivy and T10 included, goes into ONE final 29e candidate, no cut before Trivy").

## What travels here

| Path | Content |
|---|---|
| `c29e-chain.bundle` | the build clone's 23 commits `c970646cd..d39c70c7a` with their exact ids (git bundle) |
| `chain/NN-<sha>.patch`, `.msg` | the same 23 commits as reviewable held patches and their messages (WIP export) |
| `notes/scout-notes.md` | code locations per topic, "Export-step TODOs", "Trivy slice 2/3 findings" |
| `notes/trivy-design-note.md` | the Trivy adapter design (measured trivy 0.76.2 behaviour, rules) |
| `notes/afk-tiles-29d.md` | the tile texts (T1-T10, G-T1/G-T2, K-items) the PO decided |
| `test-lists/` | the affected-test lists used so far (`list-t10.txt` = the T10 run; `pre-export-29c-29d-base.txt` = the 29d pre-export list to merge) |

The commit-message sources of the clone were `scratch/agent-out/c29e/msg/01..23`; they are identical to `chain/*.msg`.

## Restore the build clone on the new machine

```
node scripts/clone-slice/restore-chain-clone.mjs restore scratch/agent-out/c29e/clone c970646cd specs/sprint-alfred-epic/evidence/held-patches/c29e-wip-handover/c29e-chain.bundle
```

It must print HEAD `d39c70c7abd8fe82b57d0a644498c979718b0fc2` (verified on the first machine into a test clone).
Then copy `scripts/clone-slice/*.mjs` to `scratch/agent-out/` (`rehearse.mjs` to `scratch/agent-out/w24reh/`,
`run-list.mjs` and `direct-importers.mjs` to `scratch/agent-out/c29/`); see `docs/operating-tools.md`, "Clone-slice route".
Run the clone's tests with the CLONE's `scripts/run-parallel.mjs` (that is what `run-list.mjs` does).

## The chain (base `c970646cd`)

| # | Commit | Content | PO authority |
|---|---|---|---|
| 01 | `2b77de2f2` | T4: close's last line names that the security verdict and final Verify reach the bundle with the next push | tiles 29d round 2 |
| 02 | `d2fc721ac` | T3 doc follow-up (checkpoint scope routes) | tile T3 |
| 03 | `d22fc9fdb` | T9: first verb group of `pipeline-state.mjs` moved to `lib/closed-evidence-repair.mjs` (pure move) + kernel list | tile T9 |
| 04 | `27f8166ca` | ADR-0101 / D253: stage-0 fast path (Elephant direct: at most 3 files, 60 changed lines, one concern, production logic at most 25 lines) | G-T1 round 3 |
| 05 | `502b6488a` | canon: "Tier-0" replaced by "stage-0 fast path", generators regenerated | G-T1 |
| 06 | `535cd55b8` | provenance caps 3/60/25 | G-T1 |
| 07 | `7ca2caaa3` | maintenance-window caps 3/60 | G-T1 |
| 08 | `e7961ec96` | EL-01 tripwire wording | G-T1 |
| 09 | `ba836f224` | T5+T1: the ONE PO-approved Critic template preimage re-pin (now used up) | tiles 29e |
| 10 | `9b1141796` | stage-0 trailer text | G-T1 |
| 11-12 | `08fa99e5a`, `182b7398b` | T5 proof (AGY split envelope passes the contamination filter, child attributed) | T5 |
| 13 | `ff5b265ab` | T10: parallel-by-default reminder (`lib/parallel-reminder.mjs`; setup-check, post-compact-reground, guard-dispatch-budget; `session.parallel_reminder_every`, default 25) | T10 |
| 14 | `bef36504c` | ADR-0102 / D254 (T10) | EL-04 |
| 15 | `56e2cc4bb` | T10 runtime projection pin | T10 |
| 16 | `51731f6e2` | Trivy adapter (`trivy config`, offline, fail-closed) | T8 |
| 17 | `74e2eeb61` | scan wiring + `lib/trivy-baseline.mjs` (blocks only findings the feature introduced) | T8b |
| 18 | `217bb595e` | triggers from tracked files at a Git top level; List kinds excluded (measured) | T8 |
| 19 | `54dff5be2` | `--disable-telemetry`, `--skip-version-check` | T8 |
| 20 | `8934c1f52` | diagnostics fixture disables trivy | T8 |
| 21 | `5062f672d` | toolchain: registry class `required-with-infrastructure`, readiness probe, preflight trigger gate, kernel list + threat model, consent text names Trivy | ADR-0092 |
| 22 | `2fa7f135d` | Verify suites `trivy-tests`, `trivy-baseline-tests` + inventory (registration 1227/0) | — |
| 23 | `d39c70c7a` | ADR-0103 / D255 (Trivy), ADR index, governance entry | EL-04 |

The ADR files, D253-D255 and their index rows live only in the chain (the clone's `docs/state.md`), not on main yet.

## Test state at the handover

- Green in the clone: security-scan 223/223; the security close chain, snapshot, v2 integration, semgrep and trivy
  baseline, trivy adapter (13/13 with the real binary and readiness); reference catalog, resolver, plan builder, v1
  migration; security-scanner diagnostics 32/32; kernel closure 11/11; toolchain registry 10/10; ADR consistency.
- `toolchain-preflight.test.mjs` cannot be run directly (guard GUARD-CONTROLPLANE-SCRIPT); only through `run-list.mjs`.
- T10 affected run (123 files, `test-lists/list-t10.txt`, at `bef36504c`): 122/123. Red:
  `plugins/pipeline-core/lib/pins/capability-inventory-checker-is-red-at-head.test.mjs` (AC-121, three cases
  "[needs protected patch ALF-C-AC121-REG]"). Most likely the inventory `sourceBaseline` that the derived-file refresh
  at apply rewrites; NOT yet confirmed. Confirm it in the rehearsal (the apply script ends with
  `refresh-derived-files.mjs`) before calling it expected.
- No pre-export affected run over the whole chain yet, no rehearsal, no repo-wide run.

## Decisions built without a tile (named in ADR-0103 as built rules; the PO may overrule)

- Trivy is default-enabled. A consumer manifest that lists the four other scanners explicitly gets trivy on
  (`not-applicable` without infrastructure files).
- No start-time readiness finding for trivy (each start would parse tracked YAML/JSON, about 1 s).
- A repository with only Helm charts reads `not-applicable` (templates are no trigger).
- Not covered: container image scan (`cap.container`), a `required_capabilities` value `iac`.

## Remaining steps, in order

1. **Pre-export affected run** over the whole chain:
   `node scratch/agent-out/c29/direct-importers.mjs scratch/agent-out/c29e/clone c970646cd --merge <extra list> <out list>`,
   the extra list adding `pipeline-start-preflight`, `guard-push-v2`, `close-path-e2e`, `finish-feature`,
   `toolchain-preflight`, the onboarding consent tests and the capability-inventory pin; then
   `node scratch/agent-out/c29/run-list.mjs <workers> c29e-pre scratch/agent-out/c29e/clone <out list>`.
   Never two heavy suites at once. Fix regressions in the clone (commit with `commit-file.mjs`, or, for test paths,
   `git -C <clone> add -- <paths>` and then `commit-staged.mjs`; trailers only `AI-Assisted: true` and
   `Dispatch: stage-0 (elephant)`).
2. **Export:** `node scripts/export-held-chain.mjs scratch/agent-out/c29e/clone c970646cd specs/sprint-alfred-epic/evidence/held-patches/candidate29e apply-candidate-29e.sh "candidate 29e"`.
   Then re-wrap the body lines that start with `Dispatch:` in the exported `.msg` of 05, 09 and 10 (a body line in
   trailer form is a malformed trailer for `check-dispatch-provenance`; content unchanged). Commit the export.
3. **Rehearse:** `node scratch/agent-out/w24reh/rehearse.mjs specs/sprint-alfred-epic/evidence/held-patches/candidate29e/apply-candidate-29e.sh reh29e`;
   include `check-dispatch-provenance` over the applied range; confirm the AC-121 pin is green after the derived refresh.
4. **Repo-wide run** on the rehearsed tree (all `harness/scripts/check-*.test.mjs` and `lib/pins/*.test.mjs`).
5. **PO report**, which must contain:
   - the Critic re-pin contents (commit 09): the lowercase envelope row `scope-marker: {{SCOPE_MARKER}}`, body item 6, the step-8 sentence;
   - the labelling question for the provenance caps: every Elephant-built candidate commit above 3/60/25 reads
     `stage0-claim-caps-exceeded` (29d too), the held-patch practice;
   - T10 is not runner-neutral: Claude gets all three points; Codex only the compact line; Antigravity none; the
     PreToolUse matcher misses Agent/Workflow/MCP/advisor calls (undercount; widening `hooks.json` needs a protected patch);
   - the consequences of Trivy default-on (above);
   - time tables net of PO waiting.
6. PO applies, stamps on the PO's word (the agent stamps), PO installs, then tell the consumer session (Glossover).

Still open after that: Critic review, Full Verify, Windows native proof, Codex/Antigravity runner updates and PO
acceptance. Nothing here is "done".

## Standing PO rules this work runs under (not obvious from the code)

- Protected plugin files change only through a held patch and a PO apply script, always rehearsed first, and the script
  must be committed for that. Stamp only when the PO says so; the PO installs.
- No Critic rounds and no Full Verify without the PO's word; never re-pin a Critic preimage without the PO (the one
  approved re-pin is spent in commit 09).
- Every push needs the PO's signature (`gates.push_approval: signature`); `--by` only with a value the PO names.
- PO decisions go as tiles (at most 4, recommendation first, plain explanation). Chat with the PO in German.
- Parallelize actively within those limits; time comparisons net of PO waiting, always as a table.

## Result of the second session (2026-11-14, second machine)

Deliverable: `../candidate29e/apply-candidate-29e.sh` with 25 patches (`NN-<sha>.patch`, `.msg`), committed on the feature
branch. Rebuilt on the current main base `7c539d75d` (the first export did not rehearse: `docs/state.md` had been
condensed on main after `c970646cd`, patch 04 failed its context; the 25 commits were cherry-picked onto `7c539d75d` with
no conflict). The build clone moved to `scratch/agent-out/c29e/clone2` (tip `57709f656`); the old clone is superseded.

- The chain is the 23 commits of the table above plus two test restatements found by the pre-export affected run
  (453 files, 6 red): 24 `security-scanner-failure-provenance` and `security-scan-large-inventory` disable Trivy in
  their fixtures (it is default-enabled, ADR-0103); 25 `close-quality-readback` now expects `trivy: not applicable` and
  `project-onboarding-v3` SECGATE-2 copies `trivy.mjs` and `trivy-baseline.mjs` into its installed-plugin fixture.
- Rehearsal `reh29e2` (fresh clone of the commit that holds the export): apply script exit 0, registration check 1227
  registered / 0 unregistered, case-completion registry valid (393 entries), derived-file refresh wrote 5 files in one
  chore commit. The AC-121 pin (17/17) is green after that refresh: its three reds were exactly the three new Verify
  suites missing from the committed `sourceBaseline`, as suspected.
- `check-dispatch-provenance` over the applied range: 15 findings, all `stage0-claim-caps-exceeded`, none
  `malformed-trailer` (the `Dispatch:` body lines of 05, 09, 10 are re-wrapped). The labelling question is the PO's.
- Repo-wide run on the rehearsed tree (all `harness/scripts/check-*.test.mjs`, all `lib/pins/*.test.mjs`, the six
  formerly red files and the new Trivy and parallel-reminder suites, 252 files): 251 green. The one red,
  `native-goldfish-host-stop-pair.test.mjs`, is a pre-existing race and not caused by the chain: it failed on the
  UNCHANGED 29d main tree too (NGSP1, `SDC-AUTHORITY-CAS reference-preimage-changed`), it is green on some runs and red
  on others, a different case each time (NGSP1, NGSP9E), and the chain does not touch that area. Run alone it needs
  about 100 s when it fails.
- Not done: no Critic, no Full Verify, no Windows native proof, no PO acceptance, no stamp, no install. Time tables
  were not measured.
