# Candidate 19 seed (opened 2026-11-02, during the candidate 18 build)

Status: a list of topics reserved for candidate 19, not a plan. Nothing here is decided beyond what is marked as a PO decision.

## 1. New topic (PO request 2026-11-02): best practices for the Goldfish, taken from Ponytail

Goal: give every dispatched Goldfish the best practices of the Ponytail project in its briefing, as non-invasively as possible. PO direction: it is enough to optimise the core briefings in the skills on the basis of the instructions Ponytail uses; review the skills of ALL dispatches on their merits and optimise them.

Source read (2026-11-02, public, MIT): `github.com/dietrichgebert/ponytail`. One prompt, `skills/ponytail/SKILL.md` (about 55 lines, 700 words), plus a compact `AGENTS.md` for agents that read a rules file. Its own claim (39 tasks in Claude Code: about 53 % less code, 26 % lower cost, 98 % of risky logic still tested) is self-reported and was NOT checked by us.

What the text says, in short: read the task and the code it touches first; list every place the change must reach (callers, tests, fixtures, config, exports) and what it could break for users; then take the first option that fully works (skip what nobody asked for and name it, reuse what the codebase has, standard library or platform feature, an installed dependency, one readable line, otherwise the minimum code); no unrequested abstraction, wrapper, option or "for later" code; deletion beats addition; keep the codebase's structure; a bug fix greps every caller and fixes the root cause once in the shared code; moved code keeps its error handling and validation; non-trivial logic leaves one small test; a known shortcut gets a one-line comment `shortcut: <limit>, <when to upgrade>`; never cut validation at trust boundaries, error handling that prevents data loss, security, accessibility, or anything the user asked for; end the reply with one or two lines on what was skipped or unchecked and any risk.

Fit with the Goldfish contract (to be settled in the candidate, this is the Elephant's reading):
- Already aligned: the scope discipline, the reach list, root cause once, error handling kept when code moves, and a closing line on what remains undone (the Goldfish report already has "remains undone").
- Conflicts to resolve, not to copy: QG-04 asks for criterion-bound tests first and RED before the production edit, not "one small test"; Ponytail's `ultra` level (question the request) contradicts a closed briefing with stop conditions and no design latitude; the session-wide activation, the levels and the slash commands do not apply to a one-shot dispatch.

Minimal-invasive route proposed for the candidate:
1. Do not install the plugin or fetch anything at run time. It adds commands, hooks and a status band to every session and puts third-party text into the governed runtime. Pin the version read, paraphrase, cite the source in one reference note.
2. One fixed paragraph (target: at most about 120 words) in the generated Goldfish briefing, rendered by the generator like the test-first paragraph of w102, so every dispatch gets it with no new runtime file.
3. Review the other dispatchable roles and skills one by one on their merits: the three Goldfish agent definitions, the Critic (a finding class for bloat: unrequested abstraction, wrapper, dependency), the plan verifier (unplanned changes), the readiness reviewer, the advisor consult (answer readable in one pass), and the skills and templates they read (`goldfish-task.md`, `critic-review.md`, `critic-review`, `advisor-consult`, the dispatch references). Change only where a rule is missing or wrong.
4. Measure before adopting: rebuild two or three past slices with and without the paragraph and compare diff size, tool calls, tokens and whether the verified checks stay green; adopt only if quality does not drop. Every added word is paid on every dispatch, so the paragraph must save more than it costs.
5. Watch the existing byte pins (skill budget, generated briefing digest, bootstrap payload) when the text is added.

PO decisions needed when the candidate starts: whether the paragraph lives in the generator or only in the agent definitions; whether the Critic gets the bloat finding class.

## 2. Findings of the candidate 18 greenfield tests (PO request 2026-11-02)

The findings of the greenfield tests the PO will run with candidate 18 go into candidate 19. They are not known yet; they are read, mapped and triaged when the PO's report arrives (as for the candidate 18 plan).

## 3. Topics deferred during the candidate 18 build

Placement of each item (candidate 19 or a later version 0.7.1) is a PO decision taken by tile on 2026-11-02; the result is recorded in `docs/state.md`.

| Item | Placement (PO 2026-11-02) |
|---|---|
| G1 authorize-critical builder for deploy, publication, release-preflight | candidate 19 |
| G8 / A18-M5 threat-model remedy text on the `prepare-push-subject` path (check first) | candidate 19 |
| C18-5 allowlist rule and C18-12 `--plan` dry run | candidate 19 |
| C18-6 rest: `heal` defers the retirement while a member is armed | candidate 19 |
| A18-B1 measurements and A18-B2 (real Antigravity runs) | candidate 19 |
| Test "public --help ... HELP-FORBIDDEN-IO" below the home directory | candidate 19 |
| G6 `push-prepare` / `prepare-critical` in a not-ready session | later version 0.7.1 |
| End-to-end run of the post-promotion hook action on a real promotion | no separate item: covered by the PO's greenfield tests with candidate 18; findings go into candidate 19 |

- G1 of the signing parity audit (`candidate-18-drafts/signing-parity-audit-2026-11-02.md`): no agent-side `authorize-critical` command builder for the deploy, publication and release-preflight kinds (catalog entries are `legacy-renderer`). Left out of 18: a larger catalog migration close to the Full Verify, rarely used.
- G6 of the same audit: `push-prepare` and `prepare-critical` are admitted only in a ready session; add only if a not-ready signing case shows up.
- G8 / A18-M5 remedy text: verify whether the threat-model remedy on the `prepare-push-subject` path is covered by w93; if not, add it.
- C18-6 rest: `routine-repair heal` retires settled pending states while another dispatch is in flight and thereby drifts the registry namespace (observed 2026-11-02; the code comment names the same drift). Candidate fix: defer the retirement while any member is armed; needs a decision because existing tests encode the opposite. Until then the operating rule is to heal only when no Goldfish runs. The `icacls` step stays declined.
- C18-5 follow-up: the pre-granted allowlist rule. C18-12 follow-up: a `--plan` dry run.
- A18-B1 measurements and A18-B2: need real Antigravity runs.
- `kickoff-promote-apply` and the bind route now hand over the hook provisioning (w104); an end-to-end run on a real promotion is still open.
- The test "public --help ... HELP-FORBIDDEN-IO" fails in any checkout below the home directory (environment effect, with or without our patches); decide whether the test should skip or the check should tolerate it.
- Scratch tooling used for the clone-slice route (clone, apply, commit, save-patch, package, chain and rehearsal helpers) belongs in `scripts/` with a header and an entry in `docs/operating-tools.md` (CLAUDE.md rule), if not done in 18.
- From the candidate 18 Full Verify runs (2026-11-02):
  - The case-completion tools written in `scratch/agent-out/` (`run-cc.mjs`: run one suite the Full Verify way and validate its stream against the effective policy; `cc-sync.mjs`: strictly extend the augmentation rows from what a suite declares) belong in tracked `scripts/` with a header and an `operating-tools.md` entry; every candidate that grows a suite needs them. Better: make the VCR01 check, or the suite registration check, fail when a suite declares more case ids than its effective policy, so the mismatch shows up in a normal run and not only in the Full Verify (candidate 18 grew 11 suites silently; w114).
  - A red suite leaves no output in the Full Verify: the run directory's `logs` folder is empty after the run and the progress journal only carries digests. Keep the failing suites' logs (bounded) in the run record, or the root cause of a red must be rebuilt by hand.
  - `scripts/full-verify.mjs` cannot resume an interrupted run; a stop after minutes costs a restart. A resume from the progress journal would be cheap insurance for the one-hour run.
  - Product note (w111): a fresh onboarding leaves `pipeline.user.yaml` untracked at the plan-acknowledgement signature, so the PO may hit `PO-SIGN-APPROVAL-MODE-UNCOMMITTED` (it names its repair). Fix in 19 if the greenfield test hits it.
  - Open by design: `codex-isolated-critic-protected-preimage-tests` (the PO's re-pin of the Critic review skill hash), `g23-read-help-tests` and `agy-item-delivery-tests` (red in any clone below the home directory, green in the main tree; see the item above), `security-scan` (needs `--remote upstream` with two remotes; 13 gitleaks findings in fixtures and old held patches, identical at the candidate 17 base).

Explicitly NOT a candidate 19 topic (PO 2026-11-02): a configurable variant of C18-17 (a second Goldfish writing the tests). Part 1 was not built because it contradicts the operating model.
