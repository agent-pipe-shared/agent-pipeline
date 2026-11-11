# C28-GUARD-LANES: one shell boundary, and an admitted test and audit lane in draft (notes)

Closest criterion: AC-108. PRD and Spec unchanged. Base: the candidate-28 integration clone state a795c822e; the patch applies on that state (`apply --check` on the real repo also printed exit 0 when saved).

## What

Part 1, which hook path a subagent's shell call takes. Established with a test (C28-GL-1) and a matrix probe (a main-session payload against a subagent payload with `agent_id`, `agent_type` and a `subagents/` transcript): Claude (`hooks.json`), Codex and Antigravity (their pretool adapters spawn it) all hand a Bash call to the SAME `guard-lifecycle-ready.mjs`, and the verdict is identical for both shapes on every read shape tried. There is no missing role or carrier, no second hook entry and no second grammar, so "main refused, subagent admitted" is not a subagent difference. The real cause is shape-dependent: `isRejectedReadFamilyCommand` (`lib/guard/shell-grammar.mjs`) listed `cat rg grep head tail wc stat file ls nl` but not `find`, `sed`, `sha256sum`, `shasum`. When the read grammar does not admit such a call (the passive-read policy refuses the target: a credential root, a system root, a directory holding a secret), it fell through to the lifecycle tail and was admitted in READY. So `ls ~/.ssh` was refused while `find ~/.ssh -type f` and `sed -n 1,5p ~/.ssh/id_rsa` were admitted, for the main session and a subagent alike. Ordinary non-credential reads outside the repository stay admitted for both by the standing PO decision D96 (unchanged).

Fix at the one shared cause, no second rule: the four names count as read-family exactly when a path operand is a target the passive-read policy refuses (`SCOPE_SCREENED_READERS`, `pathOperandsOfScreenedReader`; the two label helpers cover them). The refusal is `GUARD-READ-SCOPE-OUTSIDE-ROOT` with no override, like the siblings. `sed -i` and `find -delete` on an ordinary target keep the lanes that decide them (asserted).

Part 2, design-draft lane. The observed cases, checked against the code:
- `node --test tests/content.test.mjs tests/engine.test.mjs ...` refused `GUARD-DEVPLAN-SHELL`: MISCLASSIFIED, not a write. `opaqueScriptExecutionCandidate` (`lib/guard/devplan-shell-lane.mjs`) made the first `--test` operand a write candidate, while the bare `node x.test.mjs` form was already read-only. Now `node --test <file>...` with no other option is admitted when every operand is a plain, non-symlink in-root file named in `harness/verify-suites.json`, read through the one shared loader `loadDeclarativeVerifySuites` (the writes of a registered suite go to scratch/ and the system temp directory). One unregistered operand, a mix, an option, no operand, a directory or an escape: unchanged refusal. The pinned DEVPLANSHELL-1 case (`node --test scratch/probe.test.mjs`, a file that writes `game.js`) is unregistered and stays refused, so no pin needed restating.
- `--help` on plugin scripts refused as "no usable help": a REAL start of a script outside the measured help lists (`SCRIPTS_ANSWERING_HELP`, `SCRIPTS_PRINTING_USAGE_ON_HELP`), so the refusal itself stands. What was wrong: it appended a signature plan for it. Now `humanOverrideRoute(..., { offer: false })` (an armed capability still lifts, no plan request, no guidance) and the text says it offers no signature and names the admitted read `head -n 40 <script>`.
- Reads that met a signature offer: independent read-only diagnostics joined with `;` or a newline (`git status ; git log`) got `GUARD-PARSE-UNSUPPORTED` with a plan. `retryActionsForDeniedCommand` is non-empty only when every part is an admitted read (all or nothing), so then no plan is requested and the typed actions are the admitted form. A composition with a real mutation (`git status ; rm src/app.js`) keeps its route. A real mutation such as creating a worktree stays refused.
- Other draft-phase refusals of the same kind found: the read-family fall-through (part 1) and the signature on a flag refusal and on a read composition (above). Not found by static reading: any other read shape with a signature offer.

Docs: the Observation boundary row says what the guard does NOT cover (native read tools a runner does not route through the hook, plugin scripts reading their own inputs, no operating-system boundary) and names OS encapsulation as the recommendation, not built; identical in `skills/pipeline-start/references/happy-path.md` and `config/runner-capabilities.json` (the pair is checked row for row). The longer statement is a dated section in `docs/adr/draft-read-scope-containment-boundary.md`.

## Why

PO decisions 2026-11-10 by tile on the greenfield run reports (WSL Claude run, Codex run, candidate 27): one boundary for the main session and subagents on every runner; an admitted test and audit lane in design draft classified by real write effect; the guard never offers a signature for a read.

## Tests (written first)

Registered suite `hooks/guard-lifecycle-ready.test.mjs`, cases C28-GL-1 to C28-GL-4 (no new test file, no registration needed). Against the unchanged code: GL-1 green (that is the establishing result: no difference), GL-2, GL-3, GL-4 red. GL-2's first red came from the fixture (a non-READY lifecycle); it was changed to READY (`c28Verdict`) before any production edit, and that READY red was shown with the matrix probe on the unchanged code (find, sed and sha256sum on a credential target: exit 0 for both shapes), not by a second full-suite run. No case was changed after the implementation.

Green (final state, one suite at a time): guard-lifecycle-ready 446 tests, 443 pass, 3 skipped, 0 fail; devplan-shell-sanctioned-recovery 57/57; guard-devplan 1/1; codex-pretool-guard 1/1; antigravity-pretool-guard 1/1; claude-windows-guard-refuses-every-in-repo-read 16 pass 1 skipped; guard-split-contract 5/5; read-command-diagnosis 25/25; shell-grammar-file-is-a-kernel-path pin 8/8; guard-maintenance-window-kernel-closure 1/1 (the new import of an existing lib in the dev-plan lane did not change the closure list); runner-capabilities 5/5.

## Not changed

- `GUARD-READ-CREDENTIAL-TARGET` keeps its human-override route (K96 PO decision rows 6/16, pinned by `declared-system-skill-read-requires-human-override`): no admitted read form exists to name there. This conflicts with the sentence "never a signature for a read" for a credential target: an open design point for the PO.
- `hooks/hooks.json` (TP-4): no hook-entry fix is needed, one entry serves both. The Critic preimage files. `git -C <other repository>` outside-root reads (PO decision G20-34). The native Read, Grep and Glob lane. `docs/enforcement.md` (generated by `harness/scripts/generate-enforcement-doc.mjs`, outside this slice's trees).
- Read-only plugin scripts other than the measured help flags (an audit script's verbs) are not classified by effect; a script verb catalogue is a separate slice. The registered-suite admission is not widened to unregistered test files.

## Not proven

- The registered-suite binding assumes a registered suite writes only to scratch/ and the system temp directory; the guard cannot measure a suite's effect.
- Codex and Antigravity run the same hook file (their suites are green) but were not driven live; native read tools per runner and what an admitted script then opens are outside this guard.
- Windows: the new operand screen uses the shared passive-read policy and `rawReadCandidatePath`; no native Windows run was made here.
- Verify, the Critic batch review and PO acceptance are pending (Coordinator).
