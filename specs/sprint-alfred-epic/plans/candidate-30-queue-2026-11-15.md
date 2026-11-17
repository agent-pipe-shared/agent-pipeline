# Candidate 30 queue (opened 2026-11-15)

Items the PO names for candidate 30 (C30-1 was named first, C30-2 second). Each item says where the change lives, what must
not change, and how it is proven. Candidate 29e is applied, stamped and installed; candidate 30 starts from it.

**Build status (2026-11-16): implementation complete for C30-1, C30-5 and C30-6; Full Verify (after the install, PO 2026-11-16), native Windows proof and PO acceptance pending; Critic not run (suspended permanently by the PO, 2026-11-16).**
Four patches against `5df67f885` (consent text, design review cap, test and Verify cleanup, kernel path entry for
`lib/design-review-observation.mjs`) are held under `evidence/held-patches/candidate30/` with `apply-candidate30.mjs`; rehearsed clean in a fresh
clone (registration and case-completion checks green, derived files refreshed in one chore commit). The 183-suite affected run is green except the
kernel-closure suite, which exposed the missing kernel path entry; fixed in patch 04 and re-run green. Not built: C30-2 (the PO said later), C30-3
(no Full Verify of 30 has run), C30-4 (only the toil of the one handover is recorded). Known: `native-goldfish-host-stop-pair` is an intermittent
pre-existing race; `revised-native-design-cannot-reach-a-new-advisor-course` case (iii) was red in the build environment only, green in the clean clone run.

## Scope decided by the PO (2026-11-15)

Candidate 30 is ONE candidate that collects everything below; nothing is cut into an earlier one. Order of work:

1. The Full Verify of the installed candidate 29e state first (clone outside the repository, label `fv29e`, candidate
   commit `2f99da888`, documentation commits after the stamp included).
2. Then, together in 30: the private-name and path scrub (C30-2), the fixes for what that Full Verify finds (C30-3), the
   new topics named so far (C30-1) and later ones.
3. In parallel the PO runs new greenfield tests; their findings and the toil they show are fixed in 30 as well (C30-4).

Placeholders, filled as the results arrive: C30-3 findings of the Full Verify of 29e (the red steps, each triaged by
rerunning it alone and comparing with the 29d tree; the known intermittent `native-goldfish-host-stop-pair` race is one
of them to decide), C30-4 findings and toil of the PO's new greenfield tests.

## C30-3: findings of the Full Verify of the stamped candidate 30 (2026-11-16, commit `026ae7960`, run `fv30`)

The 29e Full Verify was aborted, so this run is the first full one since 29d. 1229 steps, 4575 s, **15 red**. Each red suite was rerun alone in the
same private home (`rerun-reds.mjs`): **12 are green alone** (load effects of the parallel run: `agy-host-commit-execution`,
`post-compact-reground`, `commit-message-policy`, `dispatch-provenance`, `critic-dispatch-preflight`, `antigravity-pretool-guard`,
`native-goldfish-host-state`, `native-goldfish-host-finalizer`, `native-goldfish-host-stop-pair` (known race), `design-approval-route-e2e`,
`pin-antigravity-design-phase-scripts-refused-in-draft`, `po-only-discard-boundary`). **Three stay red alone; none comes from candidate 30**
(the files are unchanged between `5df67f885` and HEAD, or the case is identical red on a clone of `5df67f885`):

1. `license-contract-check`: `plugins/pipeline-core/lib/feature-id.mjs` (added 2026-11-13) and `lib/maintenance-delivery.mjs` (2026-11-13/14)
   lack the SPDX `SUL-1.0` header. Fix: one header line each (plugin source, so a held patch and the PO's apply).
2. `security-scan` (gitleaks, 2 findings): two reviewed `.gitleaksignore` entries went stale because their lines moved
   (`lib/security-scanner-diagnostics.test.mjs` 268 to 274, `scripts/po-human-approval.test.mjs` 160 to 161; moved by commits of
   2026-11-14/15). Fix: re-line the two entries with `gitleaks-repair-ignore.mjs`, the reviewed values unchanged.
3. `architecture-public-greenfield-route`: cases G27-PUBLIC-001 and G20-36 fail with a JSON parse error because the in-process output of
   `materialize-architecture` has a second line (a `console.warn`/`console.error` that the fixture joins into the text). Identical on a clone
   of `5df67f885`. Cause not yet found; first step: print the second line, then decide whether the warning or the test is wrong.

Also seen, not a Verify red: `revised-native-design-cannot-reach-a-new-advisor-course` case (iii) `SDC-AUTHORITY-UNAVAILABLE` is red in
the Elephant's own shell and green in the Verify run (environment).

**Fixed in candidate 30b (2026-11-16):** a held chain of three patches against `ffb7b8b8e` under `evidence/held-patches/candidate30b/`, rehearsed
clean: the two SPDX headers (license contract check PASS on the 30b tree), the two gitleaks entries re-lined by hand because the repair script's
gate admits only domains and public keys (the security scan is CLEAN, 0 findings, on the 30b tree), and the architecture greenfield route test
now parsing the JSON line (the second line is the writer's intended next-step commit guidance; the suite is 10 of 10 green). The wrapper change below
is on main, not in the chain.

**Candidate 30c (2026-11-16, Codex greenfield blocker, project and actor names left out).** A Critic course read refused with CCA-EVIDENCE-MODE for good
(a commit registered an accepted-delivery receipt it did not hold), and the prescribed recovery, `discard-feature` in the PO's own terminal,
refused with SDC-AUTHORITY-UNAVAILABLE (`companion-owning-lifecycle-context-required`). Two causes, two fixes, a held chain of two patches against
`81937492b` under `evidence/held-patches/candidate30c/`, rehearsed clean, 122 affected suites green:
1. Root cause of the damaged commit: the commit step a sanctioned writer prints is built from what changed during the writer run. The receipt is written by
   an earlier step and left uncommitted; `materialize-architecture` only registers it in the feature manifest, so the printed
   `git commit -F ... -- <list>` took the manifest alone. Fix: every uncommitted file a manifest the writer wrote lists joins the same step
   (`lib/writer-commit-capability.mjs`); the case fails without it. The `commit-pipeline-owned` route already carried listed candidate evidence (candidate 27).
   A pre-commit completeness check for a manifest and its listed evidence is not built (defense in depth, a hook change; PO to decide).
2. Dead end of the recovery: in a catalogue project a plain shell never has an owning lifecycle context. `discard-feature` joins the verbs that take the
   direct PF-54 route without one (refused while a State operation is in flight; the writer re-proves its own gates; the hook still keeps the agent from it).
Not repaired retroactively: the damaged historical commit of the affected project stays; the prescribed recovery now runs (end the feature, continue as a new one).

**Orphaned Verify homes (PO question 2026-11-16).** A green run removed only its own home, a red run kept it and no later run removed it, so mostly red
runs would orphan one home each. `scripts/full-verify.mjs` now passes `VERIFY_HOME_KEEP_DAYS` (3) to the sweep on every run: the homes and
clones of earlier finished runs older than three days go, a recent red home stays for the reruns; a case pins it.

**Cleanup check of the run.** The wrapper's cleanup line reported the private home kept (a red run keeps it for the reruns) and 0 home-level
leftovers; the cleaner's plan is empty afterwards and the leak check printed nothing. The green-run removal of the private home is not yet
observed on a real run (this one was red). Old finished Verify homes and clones under `.fv` and `fvc` (5.5 GB, plan with
`--verify-homes 0`) are not removed without the PO's word.

## C30-6: the design review does not converge, cap it at one full round plus two diff rounds (PO, 2026-11-16, greenfield run 070_4 on Claude)

**Observation (a greenfield handover, measured).** A feature design got twelve independent `readiness-reviewer` rounds and
none said ready: open findings 8, 7, 6, 4, 2, 3, 7, 9, 5, 3, 2, 7; about 774 000 reviewer tokens; the spec grew from
about 25 KB to 61 KB and the modules from 8 to 12; no application code existed at the stop. Real defects were found (no
active profile, a module cycle, an export the own import would refuse), so the review stays; its termination is wrong.

**Causes in the Pipeline (the agent text and ADR-0085 read directly; the handover's own claims marked).**

- Every round was a fresh full review. The course (`design-course.md`, ADR-0085) intends one initial round plus delta
  rounds (`--previous`, open findings and changed text only); the Elephant never created the first receipt, so no delta
  was ever possible. Nothing in the course states that a full rerun is a deviation, and the handover reports
  that `create --open-finding` was not usable on a source that changed after the review (to be verified in
  `design-review-receipt.mjs` before building), which pushes the agent to a fresh start.
- ADR-0085 amendment D246 (2026-11-13) removed every round cap ("delta rounds until pass", structural bound 64) after a
  signature over a not-ready review; the cap and the no-signature-over-open-review rule were not separated.
- `readiness-reviewer.md` tells the reviewer to raise coverage materialisation, decomposition, first path and ADR
  coverage as questions in every round, to give every open finding an id, and to say ready only when none is open: a
  question therefore blocks, although the text calls it "never a block".
- No blocking/question split in the report, no machine check of the recurring mandatory questions, no scale switch for a
  one-developer project (decomposition drove 7 to 12 modules).

**Wanted (PO 2026-11-16: one full round and two diff rounds, the shape of the Critic batch; note QG-13 itself is uncapped
since D190, so these numbers are the PO's explicit choice for the design review, not a copy of QG-13; the Critic is not
changed unasked).** Round 1 is the one full review.
Rounds 2 and 3 are delta rounds (a fresh reviewer; only the open blocking findings of the round before and what the
correction changed). After round 3 nothing triggers a round 4: remaining blocking findings
stop the presentation as today; remaining questions are written into the signing request as accepted questions the PO
sees and signs knowingly (a regulated state, not a bypass). Reviewer output has two lists, `blocking` (contradiction,
data loss, not buildable, security, missing mandatory criterion) and `questions`; only `blocking` makes the verdict
not ready. Mandatory coverage and decomposition checks become a machine pre-check before round 1 or are asked once.
A full rerun after round 1 is refused with a typed repair that names the delta route.

**Open PO decision (tile before building).** The cap re-opens what D246 closed: signing with questions still open. Option
A: questions only (never blocking findings) may be accepted after round 3, listed in the signature. Option B: after
round 3 any open finding needs an explicit PO decision per finding. Recommendation: A (built as A unless the PO says
otherwise; the PO asked to build everything open for the next test). Keep it behind one switch point and put it at the
top of the build report: it changes what the PO signs.

**Design requirements found before building (advisor review, 2026-11-16).** The briefing must satisfy all of them.

1. **Where the cap fires.** The stopped run never called `create` or `present-plan`; every round was a plain
   `readiness-reviewer` dispatch. A cap in the receipt chain or the presentation gate fires on none of those. The
   enforcement point is the dispatch itself (guard side, per feature, a counter that a new initial receipt cannot
   reset), with the refusal naming the delta route; the receipt structural bound follows the same number. Check the
   counter on Codex and Antigravity (no observation route there).
2. **A delta contract in the reviewer text.** `readiness-reviewer.md` forbids a prior review as input and orders four
   mandatory questions unconditionally, so a delta dispatched with that text re-raises them. Specify how a delta
   briefing passes the open finding ids and the changed paths without tripping the contamination rule, and give the
   reviewer a correction-only scope (open blocking findings of the round before, the correction diff and its direct
   regressions; no unchanged-area hunt).
3. **Exit for a blocker still open after the last round.** "Presentation stays refused, no round 4" has no exit; the
   never-fully-blocking rule needs a repair someone can run. Define the explicit PO decision route (a per-finding
   acceptance recorded in the signing request), the QG-13 shape "PASS or an explicit PO decision".
4. **Who classifies blocking versus question.** The split comes from the bound report text; what `create` cross-checks
   against the report today decides whether the Elephant could pass it as a flag, which must not be possible (the
   reviewed party must not decide what blocks).
5. **Must not change.** Bindings over one or two receipts stay byte-identical; an approval already signed keeps
   verifying; stored-approval and rebind readers stay as they are.
6. **Proof.** One fixture replays the real sequence (review, source edit, no receipt, second full dispatch) and must be
   refused with the delta route named; one fixture with a report of questions only yields ready; reviewer wording is
   not unit-testable, the PO's greenfield run is the open human check.
7. **Not yet verified:** that missing delta rounds explain most of the non-convergence, and that "first receipt, then
   deltas" unblocks the stopped run (the delta reviewer text may re-raise the mandatory questions).

**Where it lives.** `plugins/pipeline-core/agents/readiness-reviewer.md`, `lib/design-review-receipt.mjs`,
`scripts/design-review-receipt.mjs`, `lib/implementation-entry-gate.mjs` and the `present-plan` path in
`scripts/pipeline-state.mjs`, `design-course.md`, ADR-0085 (new amendment), `guardrails/quality-gates.md` (a design-round
counterpart to QG-13). Protected plugin source: held patch and the PO's apply.

**Immediate unblock for the stopped run (no Pipeline change).** Create the first receipt for the current state with the
round-12 findings as `--open-finding`, fix only the one real gap, then run delta rounds with `--previous` (at most two).

## C30-4: findings and toil of the PO's greenfield tests (filled as they arrive)

**From the design-review handover of 2026-11-16 (Claude greenfield run, project and actor names left out).** C30-6
covers the termination; these further items are recorded here so they survive the other drive's uncommitted file.

- The reviewer has no shell and reports every hash and marker (`technical-spec-sha256`, ADR digests, manifest hashes) as
  "not checked" in every round: the coordinator should run those digest and marker checks as an automatic pre-check.
- Manual upkeep after each spec change took about eight tool calls (`sha256sum`, PRD marker, `create-adr --refresh`,
  `bind-adr-proposals`, stage, commit message file, `export-report`): a single `design-resync` command is wanted.
- An ADR title lives only in its sidecar and `create-adr --refresh` does not update it: a `--retitle` option is wanted.
- The briefing needs `Ruleset SHA: <sha>` and no documented source exists for the value; the run derived it from the
  plugin version suffix and the dispatch guard accepted it: document the source (or print it in the start line).
- `create --open-finding` on a source that changed after the review was reported as not usable; verify and, if true,
  give a documented route for an honest fresh start.
- The Claude model-role bootstrap is blocked in design drafting by `GUARD-DEVPLAN-SHELL` (opaque script execution) with
  no override route, so the bootstrap confirmation line is never printed there.
- Hook-context text reference for the material intake is not available, forcing the `--text-file` fallback.
- Shell guard friction: composed commands, `git config --get-regexp` with a backslash, `rg --glob` and Glob/Grep inside
  plugin directories, evidence paths refusing absolute host paths (two retries while writing the handover).
- The session rule asking for a `Co-Authored-By` trailer collides with the Pipeline trailer rule (GIT-03); the Pipeline
  rule was followed. A short note in the start output would remove the doubt.
- The actor label offered by the user was not carried by `onboarding-init` (no `--pipeline-actor` placeholder in the
  second run), so `heldIdentityChoice.pipelineActor` stayed null.
- The twelve modules came from repeated decomposition questions on a one-family tablet app: a "small project" setting
  (no parallel build, no decomposition finding) is part of C30-6.

## C30-5: tests and Verify leave their temporary folders in the home folder, nothing cleans them (PO, 2026-11-15)

**Finding.** Measured on 2026-11-15 in the PO's home folder: 62 leftover entries, 40.7 GB. The PO's rule: it is fine that
test and Verify folders exist while a run is going (a failing run may keep them), but they must be cleaned up
automatically afterwards. Today nothing does:

- `scripts/run-quiet.mjs` keeps a private TMPDIR per labelled run under `<home>/pipeline-test-tmp/<label>` and never
  removes it: 33.7 GB and 2.2 million files from about ten days of runs.
- Suites create test homes in the home folder with `mkdtemp` (a world-writable system temp folder is the wrong place
  for the permission and ancestor checks) and do not remove them: `signing-disclosure-sweep.test.mjs`
  (`.pipeline-signing-method-*`, 35 folders), `existing-public-anchor.test.mjs`, `design-approval-route.e2e.test.mjs`
  (`design-route-*`), and the local-supervisor and k79-scan suites.
- Full Verify clones named by hand (`fv*`, `fx19h`) stay forever (about 7 GB).
- The same two names `scratch/` and `fixtures/` also appear next to the repository in the PO's source folder, which
  points at a suite creating them relative to the wrong directory.

**Wanted.**

- Every suite that creates a folder outside the system temp folder removes it in a `finally`/`after` hook, including
  on a failing run unless a documented keep switch asks to keep it for a diagnosis.
- `run-quiet.mjs` and `scripts/full-verify.mjs` remove their per-run folders when the run ends (green: always; red: the
  run record and the red excerpts stay, the bulk goes), and a start-of-run sweep removes older leftovers of the same
  kind through one shared cleaner.
- The one shared cleaner is `scripts/clean-test-leftovers.mjs` (built 2026-11-15 as the manual, name-matched form with an
  age guard); candidate 30 wires it into Verify's end and into the bootstrap's housekeeping report, adds its test, and
  extends its allowlist only by measured names.
- Verify gets a check that fails when a run leaves a new unlisted folder in the home folder.
- The `scratch/` and `fixtures/` next to the repository: find the creating suite and fix its base directory.

**Proof.** After one full Verify on a clean home folder the cleaner's plan is empty; the new check pins it.

**Done so far.** The one-time cleanup was run on 2026-11-15 with the PO's approval. Built 2026-11-16: the shared removal, the wiring into
`run-quiet`, `full-verify` and the two suites, and the leak check (see the build status at the top).

**Repository `scratch/` (PO question 2026-11-16, proposal, nothing deleted yet).** Measured 2026-11-15: the checkout is about 236 GB, of
which `scratch/clones` about 130 GB and `scratch/agent-out` about 92 GB. `scratch/clones` holds about 330 build and rehearsal clones of
earlier candidates (the `k*` series, `pw-*` run-parallel work clones, `dress*`, `r2-*`, `g*` and similar); their results are held
patches or commits, so a clone is only a cache. `scratch/agent-out` holds about 90 GB of per-candidate working folders and old checkouts
next to the small helper scripts. Proposal: a tracked script `scripts/clean-repo-scratch.mjs` with `plan` (default, deletes nothing) and
`apply`, an allowlist of what stays (the helper scripts, `fixtures`, the newest candidate's build clone and rehearsal clone, anything
younger than a set age), and a row in `docs/operating-tools.md`, so the other PC runs the same command. The PO's greenfield test folders
are outside this repository and are never in scope. Run it only after the PO's explicit OK and when no Full Verify or test run is active.

## C30-2: private project names and machine paths must leave the repository (PO, 2026-11-15, "later, in candidate 30")

**Finding.** Names of the PO's consumer projects and the PO's machine-specific absolute paths are private data and must
not be in this repository (CLAUDE.md already forbids machine-specific paths and uses `<PROJECT_A>`..`<PROJECT_C>`). They
are in it anyway: a measurement of 2026-11-15 found two known names in well over 200 tracked files (handover and
archive text, plans, backlog items and ledger, specs, evidence, held patches and their commit messages, and also plugin
code and tests as comments, fixture names and expected strings).

**Wanted.** A mechanical scan, then a scrub, for both classes in tracked files, with neutral placeholders in place.

**Open questions for the PO before the build.**

- The complete list of private names (only two are known) and the path patterns that count as private.
- Held patches, patch messages and evidence files are digest-bound (apply scripts, audit bundles, inventories): a scrub
  changes their digests, so each bound file needs its digest carried over or the item decides to leave frozen evidence
  alone. Git history cannot be rewritten (never rewrite history), so old commits keep the names.
- Plugin source is protected: its part of the scrub is a held patch and the PO's apply, and the shipped tests that pin
  such strings are restated (QG-04) in the same change.

**Proof.** A tracked scan script under `scripts/` with a purpose header, an allowlist that is empty at the end, wired
into Verify so a name or path cannot return; the scan result before and after as evidence.

**Until then.** Nothing new carries a private name or path (Memory: consumer project names are private); new text uses
neutral labels.

## C30-1: the onboarding consent question is hard to read (PO, 2026-11-15, "first mini topic")

**Finding.** The first question a person meets in onboarding (the consent text the start skill relays verbatim) is one
long run-on paragraph: the purpose, about a dozen automatic steps, the tool list, the Advisor export consent and the
list of what the yes does not cover are chained with semicolons. A human cannot scan it or find what is being agreed to.

**Wanted.** The same content, better worded and structured, with bullets where it lists things:

- one short opening: what the Pipeline adds to a project and the single question being asked;
- the steps the yes covers as a bulleted list, one step per bullet, in the order they run, with the internal command
  names kept out of the headline of each bullet (a name may follow in brackets);
- the tools the Pipeline needs on this machine as their own short list (Node.js, Git, gitleaks, osv-scanner, semgrep;
  Trivy only where the project has infrastructure or container files; OpenSSL only where the person signs), with the one
  sentence on what happens when one is missing;
- the Advisor export consent as its own short paragraph (it belongs to the yes and is not asked again);
- what the yes does not cover as a closing bulleted list: the design approval, every push, every release, every human
  guard override.

**Where it lives.** `plugins/pipeline-core/lib/onboarding-consent-scope.mjs` (the question text and its per-language
entries); `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` builds `consentQuestion` from it and tells the
agent to relay `textByLanguage` (else `text`) verbatim, so the structure must survive a relay as plain text: dash
bullets and blank lines only, no tables, no markup the terminal does not render. Plugin source: a held patch and the
PO's apply, as for every protected change.

**What must not change.**

- The scope: the covered steps, the tool list including the Trivy and OpenSSL conditions, the Advisor export consent in
  the yes, and the four exclusions stay exactly as decided (ADR-0092, ADR-0103); this item rewords and restructures,
  it adds and removes no step.
- A recorded consent stores scope step ids, never a text digest (`onboarding-consent-mark.mjs`), so a reworded text
  keeps every earlier recorded consent valid.
- Every language entry is reworked together (the German reader's text first, the English one with the same structure);
  a missing entry still falls back to `text`.

**Proof.** The consent tests that pin the text and its relay (`onboarding-consent-mark.test.mjs`,
`pipeline-start-preflight.test.mjs`, `lib/pins/start-skill-fits-the-reattach-window.test.mjs`) are restated for the new
wording (QG-04); a new case pins that every covered step id still appears as one bullet, that the four exclusions are
present, and that no line is longer than the limit the start skill relays without wrapping trouble. The first real
onboarding of a greenfield project on each runner is the human check: the PO reads the question once and says whether it
is scannable.

## C30-7: a missing scanner is found only at the close (PO, 2026-11-16, "ja gerne"; for 30d, not built yet)

**Finding.** A missing required scanner (gitleaks, osv-scanner, semgrep, Trivy where the project has infrastructure or
container files) is reported at the bootstrap as a non-gating environment finding and at onboarding as a deferrable
question. It is refused only at plan approval and at the close, and only in a project calibrated `critical`; every other
project gets a notice at the close, after the work is built (`docs/toolchain.md`: a deferral lifts no check). The start
itself is not blocked on purpose: a design session needs no scanner, and the Trivy scan reads not applicable without such
files ("never fully blocking": every refusal needs a repair that can run).

**Wanted (PO decision pending on the exact scope).** Move the refusal from the close to the plan-approval gate for every
project that has not opted the security gate out, not only for `critical`, so the gap is known before the build and not
after it. The start stays unblocked. A refusal names the exact repair (the install route of `docs/toolchain.md`, or the
recorded deferral where the calibration allows one) and leaves no state behind.

**Open for the design.** Whether a recorded deferral still passes the plan gate in a standard project; what a project
without a calibrated security gate (unset stakes) counts as; the Trivy condition (tracked infrastructure files only).

**Not part of this item.** Updating the scanners (the PO's own routine does it: `go install` for osv-scanner and gitleaks,
`pipx upgrade semgrep`, the Trivy install script) and a newer-version hint in the preflight (the PO keeps the Pipeline out
of updates). Trivy is installed by the PO; the Trivy suites (`security-adapters/trivy`, `trivy-baseline`, `security-scan*`)
run once against a clone after that, because two real-binary cases skip without it; the Full Verify `fv30c` ran without
Trivy. **Update 2026-11-16:** Trivy is installed; `security-adapters/trivy` (13/13, none skipped), `toolchain-preflight` and `security-scan` are green against the `fv30c` clone. The PO decision on the exact scope is still pending; not built in 30d.

## C30-10b: `cancel-submitted-plan` refused "continuity State entry not admitted" (Codex report 2026-11-16, second finding; analysed, not built)

Read cause (code, not reproduced): `pipeline-state.mjs` (about line 14664) maps `cancel-submitted-plan` to the State entry `state.cancel-submitted-plan`, which
`lib/session-authority-registry.mjs` knows (`stateWriteEntries`), but `lib/onboarding-continuity.mjs` (`continuityObserveSharedStateWrite`) admits only
`state.reopen-design`, `state.seal-plan-approval`, `state.set-gate-estimate`, `state.revoke-plan` and `state.set-phase-no-calibration` (`continuitySharedStateEntries`) and refuses every
other entry whose write affects the `onboarding-continuity` producer, with an untyped `SDC-AUTHORITY-UNAVAILABLE`. `state.set-feature`, `state.cancel-mixed-plan-state` and
`state.set-phase-with-calibration` are not admitted either. Open design question: is `cancel-submitted-plan` meant to be a continuity-affecting write (then admit it with its CAS checks and a test),
or must it not touch the continuity producer (then the `affectedProducerIds` computation is the defect)? The refusal should in either case name an executable recovery.

## Not built in 30d, from the Critic-cost report (C30-9) and the Full Verify of 30c

- Order trap, structural fix: the delta route should accept a diagnostic produced at a HEAD that is the candidate plus only evidence-only commits with the non-evidence tree unchanged
  (classifier in `lib/critic-course-admission.mjs`: `criticExportOnlyCommit`, `evidenceOnlyCommit`, `classifyRegisteredEvidenceOnlyCommits`). 30d changed only the refusal text.
- Not reproduced: a short `--registration-commit` is refused by the preflight with a clear message (`critic-dispatch-preflight.mjs` about line 949), so the reported `CCA-MANIFEST-READ` came from
  another path; `onboarding-init --root` with backslashes (`SCF-INTERNAL ... lstat`); `DBG-SETTLED-PENDING-HEAL` after every slice (stale armed members keep the heal deferred until
  `heal --no-goldfish-running`); the security preflight reporting scanners as missing while a Goldfish runs in the background.
- Full Verify of 30c: `security-scan` red on a gitleaks `sourcegraph-access-token` false positive on the blob ids of line 2 of `held-patches/candidate30b/02-0107034d7.patch` (same shape as the
  fingerprints for `c20b-chain/13` and `c20e-fix-chain/2`); repair by the reviewed value gate (`gitleaks-repair-ignore.mjs`) or by removing the superseded 30b directory. `native-goldfish-host-stop-pair-tests`
  red in the run and again alone (known intermittent race, also on 29d).

## C30-8: the Antigravity greenfield report (2026-11-16, first run on that runner; project, remote and key names left out)

**Verdict of the report.** The run is a success the PO can work with: from the product idea to a signed close and a remote push, the
Elephant wrote no product code, four Goldfish slices ran in isolated worktrees (two of them in parallel), 99 tests green, the Critic
passed with no finding, the audit bundle was complete. Against an unguided run of the same runner and model the governed result was
better on every compared point (data safety, parental PIN, integer money arithmetic, tests). The measured cost: about 22 times the
wall time and 30 times the uncached tokens for a small app, of which about 59 % of the uncached input tokens were ceremony.

**Findings, with what the code shows (read 2026-11-16 against the stamped 30c).**

1. **P1, a second parallel slice cannot fast-forward (six calls by hand).** Confirmed: `agy-native-integrate.mjs` `fastForwardFacts`
   returns "not eligible" when `base !== head` and `plan.next` then names only the plain `apply`, which leaves the change in the working
   tree. The one-call route `apply --commit-dispatch-id` already exists but is not advertised, and it cannot write the dispatch record
   (`goldfish-host-commit-recover.mjs` writes it only with `--briefing --handback`, which the integrate script does not forward). Fix
   (keeps ADR-0099, no replay, no new authority): advertise the one-call route in `plan.next`, forward `--briefing`/`--handback`, so
   take-over, commit and the attested record are one call. An authorship-preserving replay (new commits, no commit-msg hook) is a
   separate decision and not part of 30d.
2. **P1, the one-shot close needs a manual Result bootstrap (five calls), then a second acceptance turn.**
   (a) Buildable: when the bootstrap plan needs agent authority only, the one-shot runs plan, apply and reconcile itself and returns
   `commit-required`; a plan that needs the PO still stops with the signature command; HEAD must settle before the acceptance binds.
   (b) NOT built, PO decision needed: the report asks the close to accept a natural sentence ("good! ... and then please push") as
   the acceptance. That reverses the PO decision of C28 / AC-108 (2026-11-10: one fixed yes form, no keyword is searched in an answer).
   Not changed without the PO; the cost seen was one extra turn.
3. **P1, the Critic briefing for Antigravity has open placeholders and the model check contradicts the call check.** Confirmed in
   `lib/critic-briefing-build.mjs` (`renderEnvelope` leaves `MODEL` open) and `lib/dispatch-policy.mjs` (`NAMES_MODEL` rejects
   `inherit`, while the outer call refuses a set model). Resolve with the model route source before changing which check gives.
4. **P2 raised to the push path, a pure evidence commit needs another push signature.** The report's own explanation (a wrong path list in
   the carry-forward set) was NOT the cause: it is a real mismatch (`lib/evidence-carry-forward.mjs` and `lib/record-only-paths.mjs` list
   `specs/<id>/audit-bundles/`, a location nothing writes), but the shipped follow-up admission (`authorizeAuditProofFollowUp`) takes the root path
   and never reaches that check. Asked read-only about the refused commit of the greenfield repo it answers
   `AUDIT-FOLLOWUP-CONTENT: proofs/003-push.json is not the signed proof recorded for the push approval`. Cause: the PO signed the push twice for
   one commit (the first branch name was taken on the remote), the writer carries every push proof the store holds (two files), and the admission
   accepts only the proof of the approval for the branch being pushed; it then falls through to the full gate, which refuses the bundle paths.
   Fix in 30d: a push proof is admitted when it is the proof of a recorded, consumed push approval of this commit to this remote, whatever the
   branch; a foreign key or another commit is still refused. Not changed, queued: the stale `specs/<id>/audit-bundles/` entries in the two lists
   (decide with the owner of the carry-forward ADR which location is canonical), and the late remote-branch check of the push start, which is what
   made the second signature necessary (item 5).
5. **Queued, lower priority:** guard false positives for the Pipeline's own scripts in the design phase (`GUARD-DEVPLAN-SHELL`, twice);
   `GS-16` and `GUARD-GATE-STRENGTH-SHELL` named neither the right route (`architecture-boundary-check.mjs --write-policy`) nor exempted the
   read-only `--guardrail` flag; the push-init remote-branch check comes only after the signature; the bootstrap barrier ignores a native
   `read_file` of the start skill; the resume hint refuses a hyphenated compound word; `usage-ledger.mjs --latest --row` reads only the Claude
   directory format, so the audit bundle has no cost record on Antigravity; Goldfish children read the start skill twice (bad byte offset).
6. **Tuning, measured:** ceremony is 59 % of the uncached input tokens but 31.5 % of the output; the long Elephant session is re-read in
   full after each cache expiry (two waits of about 45 minutes cost about 225,000 uncached tokens each). No change planned; noted for the
   consent and bootstrap work of C30-1.

**Order.** 1, 4, 3, 2a in 30d; 2b to the PO; 5 as capacity allows. Failing-first test per fix in an already registered suite.

**PO decisions on these (2026-11-16, tile).** 2b: a sentence whose first sentence is one of the closed yes forms is an acceptance (the rest
is recorded verbatim, never read; "yes, but ..." stays a decline because the comma continues the first sentence; a word like "good" is not
on the list). 2a: built now, by a Goldfish dispatch (deep tier, from the template), in 30d. No authorship-preserving replay (the one-call route
is enough). The push start stays as it is.

## C30-9: the Critic runs several full rounds on Claude Code instead of one full round and then diff checks (PO, 2026-11-16, details to follow)

**Finding (PO report, no transcript yet).** The fixed pattern is one full review round, then only delta checks on the code changed since.
On Claude Code several full rounds are being run, which costs too much. Marked more critical than the Antigravity findings.

**What the code already says (read, nothing changed).** `lib/critic-course-admission.mjs` requires the first review to be `full` and every
later one to be requested as `delta` (`CCA-REQUESTED-MODE`, `CCA-DELTA-REQUIRED`). A delta that moves a trust boundary or is impact-ambiguous
is admitted as an effective full round of the same course (`RE-DELTA-FALLBACK-FULL`). A damaged or discarded course ends the lineage, and the
next feature starts with a full review again. Hypotheses to test against the PO's details: the fallback to full fires too easily (the delta
request fields `trustBoundaryChanged` / `impactAmbiguous` set by default or by the agent); the delta route is skipped because the
agent builds a full request by hand; the course breaks between rounds (takeover, registration commit, export commit) so the lineage resets;
a split (batched) review counts each part as a full round. Do not guess the cause before the transcript: read which `requestedMode` and
which admission result each round had.

**Details from the PO report (2026-11-16, Claude Code, Windows, one greenfield project; the first hypothesis is confirmed).**
1. (main cause) The delta request (`register-feature-package.mjs --add-delta-request`) asks the coordinator for four judgment fields, among
   them `trustBoundaryChanged`. Set to `true`, the next round silently becomes a full round over the whole feature span
   (`RE-DELTA-FALLBACK-FULL`): 66 and 72 files and three reviewers instead of about 30 files. The consequence is visible only in the
   registration result (`nextRoundMode: full`), not while filling the field, so a cautious coordinator picks `true` and triggers the costly
   variant. A wrong value cannot be corrected after registration (the Claude Code guard rightly refuses it as undermining oversight) and no
   documented route takes the mistake back. Fix to build: state the consequence where the field is filled (the `--help` text, the input
   template and the briefing), document when `true` is factually right (a correction in authentication or authorization logic), and give the
   registration a protocol step to withdraw and re-register a delta request before a round has started on it.
2. Order trap: `critic-diagnostic-evidence.mjs` needs candidate == HEAD (`CDI-DIRTY-CANDIDATE`); an evidence-only commit after the correction
   commit (the export of the previous round) makes that impossible, and the delta command then picks the last non-evidence commit and finds no
   diagnostic (`FPR-DELTA-NO-DIAGNOSTIC`); docs-only commits are skipped (AC-108), so no document commit bridges the gap. Fix: accept a
   diagnostic bound to the right candidate or to its tree, or state "diagnostic first, everything else after" in the instructions and the refusal.
3. The Critic briefing (about 12k tokens) must be handed over by the coordinator in full; the Goldfish briefing has the `promptPointer`
   (`pipeline-briefing-file`) form, a Critic briefing has none (an attempt gave `DBG-REF-AMBIGUOUS`). Fix: the pointer mechanism for Critic briefings.
4. Smaller: `onboarding-init --root` with backslashes fails with a misleading `SCF-INTERNAL ... lstat`; `--registration-commit` must be the full
   40-character hash, a short one gives `CCA-MANIFEST-READ` and a misleading hint; `DBG-SETTLED-PENDING-HEAL` reappears after every slice so
   `heal --no-goldfish-running` was needed before each dispatch; the security preflight kept reporting the scanners as missing after their
   installation while a Goldfish ran in the background. Positive: the Critic found real, fixable defects in security-relevant flows in both rounds.

## C30-10: a successor of a DISCARDED feature cannot materialize the architecture (Codex greenfield, 2026-11-16, blocker)

Recovery of a damaged Critic course is the PO's discard and a successor feature with its own plan. The architecture receipt the discarded feature
left (`architecture/design-materialization.json`) names its feature id and plan path; the refresh route needs the same id and path, the
inheritance route needs the predecessor in `closedFeatures`, and the discard writes `discardedFeatures`. The signed successor design (it also
moves one file's ownership into the shell module) then stops at `ARCHITECTURE-DESIGN-RECEIPT-STALE`, and a second signature cannot change that
classification. Built in 30d: `lib/architecture-design.mjs` treats an entry of `discardedFeatures` as a lineage (plan still the one its receipt
names, every recorded target still holding its recorded bytes, otherwise `ARCHITECTURE-DESIGN-ARTIFACT-DRIFT`), inherits an equal design, and
replaces the targets over their recorded preimages for a changed design, including a changed ownership; a closed predecessor keeps the additive
rule. Tests: whole sequence in `lib/architecture-design.test.mjs`. Still to do: the refusal text should name an executable recovery; the
second finding of that report, `cancel-submitted-plan` refused with `SDC-AUTHORITY-UNAVAILABLE` (`continuity State entry not admitted`) after a
guard block of a read-only architecture preview as opaque-script-execution, is separate and not analysed yet.

## C30-11: candidate 30e, the optimisation chain (PO 2026-11-16: build everything feasible; the Claude and Codex improvements follow after it)

Source: the full Antigravity greenfield report read again 2026-11-16 (the runner prioritises its own findings, so quick wins were re-ranked against the code).
Built in the clone (`scratch/agent-out/c30e/clone`), one failing-first test each: (1) the two carry-forward lists (`evidence-carry-forward.mjs`,
`record-only-paths.mjs`) name the bundle's real location `audit-bundles/<feature>/...` (the writer, `close-commit-split.mjs` and the administration paths
already did; ROP4 restated to three classes); the audit bundle itself is NOT written under `scratch/` (the `scratch/auditor-evidence-index.md` of the report
was an index the agent wrote itself, the product writes no such file). (2) `resume-hint.mjs`: a hyphen-joined token of words and one- or two-digit numbers is no
credential shape (`1-2-Spieler-Minispiel` was refused with `RH-SCHEMA`; random mixed-case tokens still are). (3) `antigravity-pretool-guard.mjs`: the native
`read_file` of the pipeline-start skill consumes the session bootstrap barrier like the shell spellings.
Checked and NOT changed: `GS-16` already names its route (`--write-policy`) in its reason and the boundary check prints it; `GUARD-GATE-STRENGTH-SHELL`
exempts only provably write-free scripts and `prepare-dispatch.mjs` writes the briefing, so it cannot join that list.
Still to check or build in 30e: fitness class 1 `finding` for Pipeline metadata paths outside `src/` and `app/` (report 5.3), the Antigravity cost row of the audit
bundle (`usage-ledger.mjs --latest --row` reads only the Claude layout), `GUARD-DEVPLAN-SHELL` (needs a reproduction), the Critic model contradiction (item 3 of C30-8).
**PO observation 2026-11-16, to do once the Claude, Codex and Antigravity reports are all in:** on Antigravity the Critic and the checks are always much faster
than on the other two runners and seem to find nothing, yet something is found and corrected later. The Antigravity run measured: readiness review 2 min 34 s,
`READY` in round 1; Critic 40 planner steps, 39 tool calls, 6 min 18 s, about 180,000 tokens, pass with zero findings in its first round, with write tools available
(receipt: `functional-equivalent-read-only; OS isolation not asserted`). Compare per runner: steps and tool calls, which files each Critic really read, wall time,
tokens, findings per round, and whether a later round found what the first missed. No conclusion before the three reports are compared.

## C30-12: the full review of the successor of a discarded feature is refused `CCA-MANIFEST-READ` (Codex greenfield, 2026-11-16, blocker; built in the 30f wave)

The original feature was discarded while its implementation stayed in Git history; a successor feature got a NEW manifest. The approved successor Spec requires an
independent review of the complete inherited implementation, but course admission needs the successor manifest at the diff base, and the only admissible base
(the commit that first added the manifest) omits the inherited work: a silently narrowed review. The handoff text lives in the Codex project, not in this repository.
Built (clone chain, held patches `w30f4`, `w30f4b`, `w30f4c`): when the manifest is unreadable at the base AND the predecessor is recorded discarded in the State
AND the base is a strict ancestor of the commit that first added the successor manifest, the base is admitted and the course identity binds the first-added
manifest, the introducing commit and the predecessor. The relation comes from the manifest's own `supersedes` or, for an already registered successor
(registration writes `supersedes:null` and an approved manifest cannot be edited), from the new explicit input `--successor-of <feature-id>` of
`prepare-dispatch.mjs critic` / `critic-dispatch-preflight.mjs`, validated against the State. A later round without the flag recovers the predecessor from the
retained course key; the finalizer reads a review unit at its declaration commit and forwards `successorOf`. Not covered: the finalizer command end to end for a
flag-only successor (round 1 consumed through `admit`), a merge history for the first-added lookup. Open: no writer sets `supersedes` at successor creation
(feature-package-registration.mjs line about 354), the State is a working-tree file, so a later round on another machine without the discarded record is refused
`CCA-ALIAS-MAPPING-UNAVAILABLE`.

## C30-13: candidate 30f, the Codex and Claude fixes (PO 2026-11-16: "baue die abc sachen ein"; no Critic, no Full Verify)

Built as Goldfish slices on the 30e chain, held patches under `evidence/held-patches/w30f*`:
- `w30f1`, `w30f1b` (C30-10b): the continuity authority refuses a State entry it does not admit with a typed repair, and admits `state.cancel-submitted-plan` and
  `state.cancel-mixed-plan-state` through a second closed set that accepts exactly the continuity revision advance of +1 their writers make. A session with a BOUND
  session-cleanup binding, an orphan binding or a live member is still refused BEFORE the write with a typed reason: the bound session's legacy lifetime key
  (`continuitySharedStateLogicalLegacyKey`) digests the whole cleanup identity including the revision, so the registry's `state-legacy-operation-effects` check
  would fail after the write. Open (queue as the next item): make that key or the registry check stable across a +1 advance; restore the `reopen-design` route
  in the bound-session refusal text (it names `plan-recovery` there, G1 alone named `reopen-design`). Unknown whether the Codex session was bound.
- `w30f2`, `w30f2c` (Claude order trap): the Critic diagnostic is accepted when HEAD is the candidate plus evidence-only follower commits (registration, consumed-review
  export, disposition addendum), still bound to the candidate; the packet consumers install the classifier explicitly and revalidate a follower diagnostic against
  the host repository instead of the disposable checkout. A static import of course admission from the packet module is NOT possible (a measured load-order cycle).
  Open: the export-follower producer case (the motivating one) has no end-to-end case; the packet preflight assumes the canonical packet layout (common dir four
  levels above the checkout), any other layout fails closed.
- `w30f3b` (C30-7): a missing required scanner is refused at the plan gate (`present-plan` before the signature, and `set-phase implementation`) for every project
  that has not opted the security gate out; a recorded machine-local deferral or committed exception passes with a notice; unset stakes count as standard; the
  generated toolchain document was regenerated. Open: other suites outside the slice whose fixtures enable scanners without injecting `toolchainPreflight` now depend
  on the host's scanner binaries (the affected run decides).
- `w30f4`, `w30f4b`, `w30f4c`: C30-12 above.
Not run for any of these: Full Verify and the Critic (both suspended by the PO). Derived files (inventory, ledger, positional case ids) need the refresh after the
apply. The 30e affected run listed `lib/administration-documentation-paths.test.mjs`, which does not exist: a spurious red of the list generator, not a defect.

### C30-15 Dead-end wave (PO 2026-11-17: "every path needs a happy path and a recovery, too many dead ends")

Source: the Claude greenfield handover (an onboarding feature in a protected Windows project) and the Codex successor-review block, both read 2026-11-17 after the 30e stamp. Rule from the PO: fix sustainably, no follow-up drift; every stop names a runnable recovery or a named human step. Held patches: `w30g1` (C30G-D1), `w30g2` (C30G-D2), `w30g3` (C30G-D3), plus the acceptance yes list and the `CCA-MANIFEST-READ` text built in the integration clone.

| # | Finding | Status |
|---|---------|--------|
| 1 | After the Result bootstrap `result.md` stays uncommitted; committing it breaks the manifest digest (`FTP-ARTIFACT-3`) | Not reproducible in the current flow: C30G-D1 proved the bootstrap, the agent-run reconcile and the owned commit leave a clean tree with the Result at the bound digest (`close-path-e2e` asserts it, 9 of 9). The run most likely used the 30c flow (the one-shot printed steps instead of running them); the 30d one-shot closes it. The hand steps that shaped the state: committing result.md before the reconcile, then reverting it. |
| 3 | `result-close-block` stops `COR-ENTRY-EXIT` / `PS-RESULT-CLOSE-RESULT` with no cause | C30G-D1: `PS-RESULT-CLOSE-RESULT` names its cause (`is-prd-or-spec`, `missing-or-unsafe`, `empty-or-oversized`, `digest-changed`), the owner route carries the entry text, `ONESHOT-RESULT-CLOSE-BLOCKED` stops before Verify. The one realistic cause is a change of result.md after binding (an edit, or a commit and a revert); the only sanctioned repair is to bring the bound bytes back from Git (`git restore --source=<commit> -- <path>`). The rebind pair is not a digest repair (it moves a binding between `Result.md` and `result.md`); the retire pair needs the current digest equal to the bound one. Open: whether the guard union admits that `git restore` as an agent command (fixtures use plain Git; otherwise it is a PO terminal command). |
| 9, 10 | A partial close leaves uncommitted evidence; a gate-definition change made mid-close makes the PO signature impossible (dirty tree) and `commit-pipeline-owned` refuses `CPO-MANIFEST-EVIDENCE` for a deleted listed evidence file | C30G-D2: the refusal names the recovery (an uncommitted manifest: restore it and move the untracked outputs out, then rerun; a committed manifest: the listed digest is fixed, `FPR-VERIFY-IMMUTABLE`, so put the original bytes back; if they are gone for good, a new feature and a PO discard), one clean-tree helper (commit with `commit-pipeline-owned --agent`, the PO signs on the clean HEAD, identical rerun) serves every stop that needs a clean tree, the Verify "dirty" stop lists the paths, and a contract test requires every `stopResult` of the one-shot close to carry a runnable command or a named human step (empty exception list). The briefed route through `register-feature-package --add-verify-evidence` was wrong (it refuses a changed listed file); the Goldfish found that and printed only proven routes. Order hint for projects: a calibration change such as `repositoryMode` belongs before the feature or in its own block, never inside a running close. Open: `CPO-FOREIGN-CHANGES` still names no recovery for a modified tracked `acceptance.md`; the whole sequence restore, move out, rerun is proven in fixtures only. |
| 4 | After a plugin reload: `SDC-AUTHORITY-CAS windows-native-identity-drift` and `SDC-AUTHORITY-HELD` name no repair, `HOOK-SNAPSHOT-STALE` needs a hand refresh, `plugin-attestation-required` has no `nextAction` (registry lists the previous stamp) | C30G-D3: each refusal names its one recovery (`SDC-AUTHORITY-CAS` and the catalogue-source-closure case name heal, a held legacy registry names move-aside, other held reasons only inspect; the hook text says run it once, then repeat the refused command); the Claude attestation readback states the loaded and the registry versions and the recovery while `nextAction` stays null by design; one section `After a plugin reload or update` in `references/local-plugin-attestation.md`. The same `HOOK-SNAPSHOT-STALE` hit the Elephant's own commit after the stamp: `refresh-mandatory-hooks.mjs --root <root>` fixes it. Not proven: heal clearing the Windows identity drift (it is raised only on Windows). |
| 5 | Verify fails in the Claude sandbox with `WIN-AUTH-OPEN` on the first run | Not built: host sandbox behaviour; the next Full Verify on a Windows host decides. |
| 7 | Critic addenda lie under an ignored root `/evidence/` path | Open: check the generated `.gitignore` of onboarding and the addenda path; the close already commits them with `git add -f`. |
| 2, 6, 8 | The acceptance question comes before Verify; `trustBoundaryChanged` is ambiguous (a `true` forces an irreversible full round); the architecture boundary policy has no owner or expiry and later edits are gate-protected (GS-16) | PO tiles 2026-11-17: (2) the question comes AFTER Verify, built as `w30g4-acceptance-question-after-verify` (a red or dirty Verify stops without asking; the rerun repeats the Verify, cost stated; a decline stays before the Verify); (6) the flag is struck from diff rounds, built as `w30g4-trust-flag-leaves-diff-rounds` (key accepted and ignored so no old record or digest changes; `impactAmbiguous` and the first full round unchanged); (8) the policy stays unbounded, the one-sentence note is pending (C30-17). |
| C | Codex: the review of a successor of a discarded feature still stopped `CCA-MANIFEST-READ` with the 30e stamp | The explicit flag `--successor-of <predecessor feature id>` is the route; the refusal text did not name it. Built: the refusal now names the flag (the pinned digest of the text was restated, QG-04). A first run on real data is pending; later rounds recover the predecessor from the retained course; the State is a working-tree file, so another machine is refused `CCA-ALIAS-MAPPING-UNAVAILABLE` (open). |
| Y | Acceptance answers: "gut" and every plainly positive answer count (PO 2026-11-17; the signature before a push stays the final gate) | Built: a closed list of positive forms per language next to the core forms; the question prints the core forms plus three examples; a doubt, a negation or a "but" never accepts. |

Codex session binding (asked 2026-11-17): the Codex session is recognised, no authority lock is held and no owner binding is confirmed, so `cancel-submitted-plan` is admitted for it with the 30e stamp.

### C30-16 PO-requested temporary model exception (PO 2026-11-17)

Trigger: the PO ordered a state-machine analysis on the design-tier model Fable 5.2 as an exception to the model default. `guard-dispatch` refused the dispatch (`DISPATCH-MODEL-UNROUTED`: no configured route selects `fable`). The only existing way is an edit of `routing` in `pipeline.user.yaml`, a gate-strength file (GS-1; the write guard exempts only `language.human_facing`), so it needs a signed override and a committed edit would be an unproven gate-definition change at the next close (`CLOSE-GATE-CHANGE-UNPROVEN`). The PO decided: no Opus fallback, no manual yaml edit, build the exception route in the next candidate.

Wanted: a typed, recorded model exception the PO requests per dispatch (or per short window) that `guard-dispatch` and `dispatch-briefing.mjs` both read, without any edit of `pipeline.user.yaml`: scope is one dispatch id or a bounded count or time window, one model alias from the closed family list (opus, sonnet, haiku, fable), the PO's request recorded with its reason (an attribution record; whether a signature is required is a PO decision), consumed or expired automatically, never widening what the dispatched role may do, shown in the dispatch record and the audit evidence as `model exception: <alias>, requested by the PO at <time>`. The same mechanism should carry a temporary effort exception. Acceptance: a Fable dispatch is admitted exactly when a live exception names it; without one the refusal names the one command that records the exception. Parked until then: slice C30G-SM1, the state-machine simplification analysis (Fable 5.2); its briefing and package are prepared in `scratch/`, and the tracked `scripts/clone-slice/mkpkg.mjs` should take an optional `modelId` per slice, as the scratch copy now does.

**Built in the 30h chain (2026-11-17, Goldfish `C30G-M16`, deep tier, two checkpoint grants; held patch `w30h1-dispatch-model-exception`, commit 11 of the chain plus three of my own commits):** `scripts/dispatch-model-exception.mjs` (`record`, `list`, `revoke`; `--by` required with no default, an attribution record, no signature), the store `lib/dispatch-model-exception.mjs` (closed shape, digest chain, fail closed, `--move-broken-store-aside` repair), the admission and consumption in `guard-dispatch.mjs` (consume once per admitted new dispatch, undo on a later refusal, idempotent per dispatch id), the host-commit reader accepts an exception-admitted model, the briefing prints `model exception: <alias>, requested by the PO at <time>`, a dispatched agent can never reach the script or the store (budget guard), every refusal names its one runnable step (table in the notes). The existing model-family approval cannot carry a one-dispatch exception (it is a signed, candidate-bound migration that must map every route), so it was not reused. My own additions after the Goldfish stopped at a file outside its write list: the capability table row and the guide row, the store in `NEVER_LIFTABLE_KERNEL_PATHS` with its threat-model sentence (the kernel closure suite was red without it), and two case ids in the policy row of the dispatch model guard suite. Proof: 71 affected suites green on the final stack (rehearsal of the whole chain clean), the Goldfish's own targeted runs (30, 7, 8 and 3 cases). Not proven: a real dispatch under a recorded exception (the first one will be the Fable analysis), the dispatch record carries no exception field (a schema change was refused on purpose; the store is the audit source), `guard-dispatch.mjs` and `guard-dispatch-budget.mjs` grew by about 34 and 27 lines though both already exceed their architecture line bound. The Critic is suspended, so no live round.

### C30-17 Pending edits of the 30h wave that need the PO route (PO 2026-11-17)

`w30g4-trust-flag-leaves-diff-rounds` changed the behaviour only. Its text edits are pending because the protected preimage inventory `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json` pins the raw sha256 of `skills/critic-review/SKILL.md` and `templates/prompts/critic-review.md` (and `codex-critic-host.mjs`, and `codex-critic-dispatch.schema.json`), which is not a test edit: (1) drop `trustBoundaryChanged` from the SKILL operator note and from the `append-correction` paragraph of both copies of the template (they must stay byte-identical, `check-vendored-template-sync`), keep the cost warning for `impactAmbiguous`, say that an old value is accepted and ignored; the exact sentences are in the w30g4 notes; (2) `codex-critic-dispatch.schema.json` still lists `trust_boundary_changed` as required, so the Codex host keeps supplying the ignored value; (3) the one-sentence note that the architecture boundary policy is deliberately permanent (no owner, no expiry, a later edit is gate-protected under GS-16 = `architecture/boundary-policy.json`, ADR-0096, and nothing about it stops a close for age) has no writable description to live in; (4) until the re-pin the texts still describe the removed behaviour. The Critic suspension covers only this repository's own candidates: the consumer-project sessions (Claude, Codex, Antigravity) keep running Critic courses, so the drift is live for them. Consequence to state to the PO: a delta request registered with `trustBoundaryChanged: true` and not yet consumed becomes a plain diff round after the install (the value has no effect), so a consumer course with such a pending request gets a narrower round than its Coordinator chose; old consumed records and their digests are unchanged (proven by tests). Built together with E2 in the 30h chain (commit `P1`): the SKILL and both template copies, the two new preimage digests, the policy sentence in `architecture-boundary-check.mjs`. Proof: the 37 reader suites of those files green in the clone (preimage test, vendored-template sync, `close-path-e2e` with its nine walks, chain walk, the Critic host and preflight suites); the 30h case-completion run found and I fixed three missing case ids (`CCA099` to `CCA101`) and two (`GDM06`, `GDM07`).

### C30-18 Antigravity custom agents: what the runner now offers and what it shows on this machine (PO 2026-11-17)

Sources read: the Antigravity launch post "Introducing custom agents", the docs pages "Custom subagents" and "Build plugins" (antigravity.google), and the installed runner (version 1.5.10): `agy plugin validate --strict --json` on the installed Pipeline plugin, `agy agents`, `agy plugin list --json`. What the docs say: an agent is a Markdown file with frontmatter; `mainAgent` and `subagent` both default to `true` (so a plugin agent can be chosen as the main session agent with `agy --agent <name>` or `/agents`); `model` is `inherit|flash_lite|flash|pro` and applies when it runs as a subagent; `tools` is an allowlist that defaults to ALL tools when omitted ("omitting file-edit and shell tools makes a read-only agent"); a misspelled or unmapped tool name may make the subagent hang; `commandExecutionPolicy` defaults to `sandbox`; `inheritMcp` and `inheritCustomizations` (skills, rules, hooks) default to `true`; plugin hooks come only from `hooks.json` at the plugin root and a hook that exits non-zero fails open.

Findings on this machine (measured, not inferred):
1. **Skill bodies are truncated at 24000 bytes under Antigravity.** `plugin validate --strict` reports it for `critic-review` (about 44 KB), `close-block` (about 43 KB) and `close-feature` (about 39 KB). Everything past byte 24000 never reaches an Antigravity session: for the Critic skill that is about line 230 of 430, so the whole delta-round operator note (the text P1 edits, line 350) and the course-recovery sections are invisible there. The strict validation also fails because of it. Not known in the repo before this.
2. **`agy agents` lists only `consult-advisor` and `readiness-reviewer`**, although the plugin carries eight agents. The two listed are exactly the two whose installed copy has no `model:` line (the other six carry `model: flash`). A likely reading (unproven): an agent with a fixed model is not offered as a main agent, an agent without one is. If so, those two read-only role agents can be chosen as the main session agent of a project with `agy --agent`, which no role design intends.
3. **No shipped agent sets `mainAgent: false` or `subagent: true`, and none pins `commandExecutionPolicy` or `inheritCustomizations`.** All defaults apply; the guard hooks reach a subagent only through `inheritCustomizations` (default true), which is therefore load-bearing and unpinned.
4. **The tool allowlist table `AGY_RUNNER_TOOL_MAP` (`read_file`, `write_file`, `edit_file`, `run_command`, `grep_search`, `find_by_name`) comes from one 1.4.2 smoke run** (its own comment says a real run is still open); the docs example names `view_file`, `replace_file_content`, `grep_search`, `run_command`. The guard knows both name families. Nothing proves which names runner 1.5.10 registers for `edit_file`/`write_file`.
5. The Critic agent keeps `write_file`/`edit_file`/`run_command` in its allowlist (a single scratch note file is allowed, a guard confines the path); the allowlist alone therefore gives no read-only guarantee for it, while `readiness-reviewer`, `consult-advisor`, `afk-claude-worker` have a truly read-only list.

Wanted (build in the next candidate unless the PO wants it earlier; items 1 and 2 first): (a) split or shorten the three skills so the operative rules sit inside the first 24000 bytes, or move the rest into `references/` loaded on demand, as `pipeline-start` already does, with a size test that fails above 24000 bytes for any shipped skill body (that makes `plugin validate --strict` green); (b) the runner view (`lib/agy-central-snapshot.mjs`, the closed rewrite table) writes `mainAgent: false`, `subagent: true` and pins `commandExecutionPolicy` and `inheritCustomizations` explicitly for every shipped agent, so the Claude source files stay unchanged; (c) one attended measurement on 1.5.10 settles item 4 and the reading of item 2 (`agy agents`, one `invoke_subagent` per role; needs the PO's agy session, not buildable here); (d) a measurement of whether the frontmatter `model` selects a model where the call-level `Model` alias was measured not to (M4c/M10: `flash` and `pro` both resolved to the same model).

**Built in the 30i wave (2026-11-17):** (a) as `w30i1` (the three skills keep their operative core in SKILL.md, whole sections moved byte for byte into references, a size guard at 22500 bytes; the real `agy plugin validate --strict` on the generated view no longer warns about 24000 bytes), (b) as `w30i2` (the runner view writes `mainAgent: false`, `subagent: true`, `commandExecutionPolicy: sandbox`, `inheritCustomizations: true`; the new keys are accepted by the real validator). Honest risks: Claude's `context: fork` with `agent: critic` makes the Critic skill body the Critic's whole dispatch, so a forked Critic that skips the MANDATORY reference reads a shorter skill (no live proof either way); `mainAgent: false` and the real `invoke_subagent` per role on 1.5.10 are unmeasured (items (c) and (d) stay attended PO steps).

### C30-19 Committing needs a message file every time (PO 2026-11-17, "ist das toil?")

PO observation: every commit first needs a text file written and then passed with `-F`; can the guard be made safe enough to allow a direct commit? Findings (read in the code, one dry run): the guard ALREADY admits a direct, single-command form. `lib/commit-message-policy.mjs` parses `--trailer` and rebuilds the message as Git does (paragraphs from the `-m` flags, then the trailers as ONE contiguous final block), and `git commit --dry-run -m "<subject>" -m "<body>" --trailer "AI-Assisted: true" --trailer "Dispatch: stage-0 (elephant)"` passed every guard (a dry run: Git itself answered "nothing to commit"; a real commit with this form is not yet proven). The toil is therefore a TEACHING defect, not a missing function: the guard's own refusal (`hooks/guard-git.mjs`, the G20-21 lines) and `templates/prompts/agent-obligations.md` (two places) tell every agent to write a file and use `-F`, and one sentence there claims `-m` with `--trailer` and a parenthesised trailer value is refused by guard-push (the dry run contradicts it for the commit guard; the sentence may describe an older state). Wanted: (1) prove the direct form on a real commit (the next genuine Elephant commit uses it); (2) if it holds, make it THE documented route: the refusal text, `agent-obligations.md`, the `conventional-commit` skill and `guardrails/git.md` name `git commit -m <subject> -m <body> --trailer "AI-Assisted: true" --trailer "Dispatch: <id>"` first and the file route as the fallback for a long body; (3) if a parenthesised value is refused somewhere, find the guard that does it and fix it, never the agent's habit; (4) the `commit-msg` backstop stays unchanged (it inspects the finished message). No new authority is granted: the same final-block rule is checked, only the spelling is wider.

### C30-20 The signature ceremony shows hashes, not what is being signed or why (PO 2026-11-17)

PO observation: the signature commands carry information but it is not nicely prepared and has no factual explanation; a human should understand what they sign and why. Findings: the attended confirmation of `authorize-critical` (`scripts/po-human-approval.mjs`, near line 2762) prints `action kind`, candidate commit and tree, the subject sha256, expiry, feature id and the approval intent sha256, a few kind-specific lines (release preflight, interruption promotion, residual acceptance, Critic acknowledgement, spec addendum, gate change, maintenance red, verify replacement), and one generic sentence of what is NOT covered. It has `humanFacingLanguage`, but no plain-language part: nothing says in words what the action does (for a push: which branch goes to which remote, how many commits, what the commits are about), why the gate asks now, what the signature lets the agent do and until when, what stays forbidden, and what happens if the human declines. The `prepare-authorization` / `emit-signature-digest` / `authorize-by-signature` commands of the human guard override and the push approval have the same shape. Wanted: a rendered plain-language card BEFORE the hashes, per action kind, in the human-facing language of the project: what (one sentence, concrete: names, counts), why now, what the signature allows and its expiry, what it does not allow, the effect of a decline, and which facts are bound (so the hashes remain, as the evidence, under the card); the card is built only from values the request already holds (no new authority, no new bound field, no change to any digest or to the request schema), and it is exercised in a test for every kind that has a confirmation today.

### C30-21 A mistyped passphrase leaves the signature ceremony blocked until a move-aside (PO 2026-11-17, Windows greenfield, "nur fixen wenn wirklich ein Defekt")

Observed (PO terminal, Windows, a consumer project, kind `acknowledge-gate-definition-changes`): the attended `authorize-critical` was run, the confirmation shown, `approve` typed, and the passphrase was wrong; OpenSSL printed `bad decrypt` and `pkeyutl: Error loading key` and the command ended. The identical command rerun at once, and a third time, answered only `PO-HUMAN-APPROVAL-FAILED: chat:member-source-drift` with no repair named; the PO then needed a move-aside (the authority repair) before a new entry was possible. This is a defect by the repository's own rule: a typo must allow a new entry, and every refusal must name a runnable repair (PO hard rule "never fully blocking"). Reading of the code (not reproduced): `lib/chat-gate-ceremony.mjs` publishes the ceremony as records (`reserved`, `running`, `terminal-observed`) and a registry member; a failed signing is caught in `ceremonyExecuteBody` and published as `cancelled`, but `reconcile` (about line 343-348) refuses `chat:member-source-drift` when the registered member's source facts differ from the records on disk, which is the state a ceremony leaves when its process ended between two of those writes (or when the failure path wrote the terminal record without advancing the member). Wanted: (1) a failing-first reproduction in the existing suites (a signing step that fails after `running`, then a second ceremony in the same repository): the second one must start; (2) the wrong-passphrase path ends in a CLEAN `cancelled` terminal with the member released, so a rerun needs no repair; (3) a ceremony left half-way by a process that ended (no live owner) is retired by the next ceremony start through the existing repair route, automatically and with a one-line note, never by a PO command, and when it cannot be retired the refusal names the exact runnable repair (`routine-repair.mjs run heal` or the specific command) instead of `chat:member-source-drift` alone; (4) optionally, up to three passphrase attempts in the same run before ending (the PO's wish: a typo allows a new entry), only if this needs no new authority: each attempt signs the same already shown intent, nothing new is written between attempts. Scope guard: no change of the request schema, the intent digest, the proof format or any key handling.
