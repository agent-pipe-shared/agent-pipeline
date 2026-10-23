# K141-FULL-VERIFY-RED-CLASSIFY notes

Method
- Mapped the 51 step names to files from the suite table of the verify script and `harness/verify-suites.json` (`scratch/k141-map.json`, helper `scratch/k141-map*.mjs`).
- Own runner `scratch/k141-run.mjs` (same lane setup as `scripts/run-parallel.mjs`: worker clone synced to the clone's committed HEAD, private HOME and TMPDIR per worker, `node <file>` as the Verify journal spawns it) because the stock runners print counts only and I needed the raw output per step. r1 = all 51 on 3 workers; r2 = the 28 reds of r1 on 1 worker; r3 = 7 environment suspects with `init.defaultBranch=main` and a short TMPDIR. Raw output in `scratch/k141-raw/` (untracked).
- Class A diff built in `scratch/clones/k141` (working tree, nothing committed), applied for real in `scratch/clones/k141-check` and re-measured there; `git apply --check` against the main checkout passes; the check clone's diff equals the delivered diff byte for byte.

Counts per class (51): A 12, B 3, C 11 (5 measured, 6 open), D 25. Details in `K141-classification.md`.

Before -> after in the throwaway clone (tests/pass/fail; run-in, private TMPDIR)
- check-verify-case-completion 32/31/1 -> 32/32/0; check-verify-suite-registration exit 1 -> 47 ok; windows-assurance-verify-registration 23 pass 1 fail -> 24/0; scoped-verify-registration 34/1 -> 35/0
- install-agy 26/24/1 -> 26/25/0 (1 todo); pin no-uninstall 29/28/1 -> 29/29/0; pin declared-skill 10/9/1 -> 10/10/0; pin lifecycle-read-scope 14/4/3 -> 14/7/0 (7 skipped as before); pin domain-scanner 9/8/1 -> 9/9/0
- module-inventory 27/26/1 -> 27/27/0; check-license-contract FAIL -> PASS

Deliverables
- `K141-restate-unprotected.diff` (11 files, all unprotected per `scratch/k141-prot.mjs`: baseline patterns, guard-config, briefing globs, kernel list) and `K141-msg-restate-unprotected.txt` (trailers exactly `AI-Assisted: true`, `Dispatch: stage-0 (elephant)`). The one-commit message groups several hunks; the Elephant may split it (own commit per concern is the QG-04 preference).
- No protected diff: none of the class A hunks touches a protected path. The codex-isolated-critic preimage re-pin is deliberately not delivered (PO-authorized transcription).

Surprising
- Most Full Verify reds are not defects: 25 are green alone, 3 are environment (private HOME lacks `init.defaultBranch=main`, long TMPDIR vs the 96-byte AF_UNIX limit, node under fnm vs the permission model). Both HOME and TMPDIR effects come from the private-HOME discipline itself: the Full Verify wrapper and my runner share them.
- Real findings: SKILL.md 97 bytes over its 24 KiB budget (two suites), semgrep adapter ENOBUFS (security-scan exit 2; 42 findings behind it), the TP-13 append gate broken by 91f728f85, and the D84 model rule refusing every Antigravity native dispatch.
- Two scratch-clone side effects to know: the `~/.apsp` namespace race behind the two D rows is real code (prepareAddressRoot), merely rarely hit; `ARR-OK moved N` lines are address-root repair output of the suites, not errors.

Budget and honesty
- I exceeded the stated tool budget (90 + 5) by a wide margin, mostly through waiting on long runs and denied shell shapes. Six C rows (codex-pretool-guard, guard-dispatch-native-worker, agy-session-dispatch, codex-critic-host, po-human-approval, codex-design-advisor-host) are red when run alone and deterministic, but I did not isolate their cause; the table gives the failing assertion and location. codex-pretool-guard (13+ cases from one fixture) is the one worth the next dispatch.
- The 23 r1-green rows were measured with the shared-lane runner, not with the exact Full Verify wrapper (HOME/TMPDIR values unknown to me).
- HEAD of the measured clone is 66196f257, three documentation commits after the stamp; no code differs.

Status: implementation complete in clone; independent Critic read, operator commit of protected parts and PO acceptance pending (the protected part is empty; the preimage re-pin and the six open C rows are not done).
