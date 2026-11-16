# Candidate 30 queue (opened 2026-11-15)

Items the PO names for candidate 30 (C30-1 was named first, C30-2 second). Nothing here is built; each item says where the change lives, what must
not change, and how it is proven. Candidate 29e is applied, stamped and installed; candidate 30 starts from it.

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

**Wanted (PO 2026-11-16: like the Critic, QG-13 — one full round and two diff rounds).** Round 1 is the one full review.
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
otherwise; the PO asked to build everything open for the next test).

**Where it lives.** `plugins/pipeline-core/agents/readiness-reviewer.md`, `lib/design-review-receipt.mjs`,
`scripts/design-review-receipt.mjs`, `lib/implementation-entry-gate.mjs` and the `present-plan` path in
`scripts/pipeline-state.mjs`, `design-course.md`, ADR-0085 (new amendment), `guardrails/quality-gates.md` (a design-round
counterpart to QG-13). Protected plugin source: held patch and the PO's apply.

**Immediate unblock for the stopped run (no Pipeline change).** Create the first receipt for the current state with the
round-12 findings as `--open-finding`, fix only the one real gap, then run delta rounds with `--previous` (at most two).

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

**Done so far.** The one-time cleanup was run on 2026-11-15 with the PO's approval.

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
