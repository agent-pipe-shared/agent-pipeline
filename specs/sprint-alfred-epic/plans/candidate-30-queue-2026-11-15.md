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
Trivy.

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
