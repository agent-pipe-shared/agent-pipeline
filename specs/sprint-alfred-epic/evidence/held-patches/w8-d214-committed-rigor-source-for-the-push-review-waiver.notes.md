# W8 D214 - committed rigor source for the push review waiver: notes

> **Read first: this patch does NOT contain the waiver.** The file name follows the dispatch id. The patch edits only the chain-walk test
> (`lib/pins/critic-course-consumer-chain-walk.test.mjs`): its fixture no longer force-adds the consumer-gitignored State, so the walk's push
> step reaches the real review decision. The waiver itself (D214) is blocked on a PO decision between the options A/B/C in section 3. Apply
> order: after `w8-chain-walk-critic-course-consumer-paths`.

Slice: W8-D214-COMMITTED-RIGOR-SOURCE-PUSH-REVIEW-WAIVER-20261031 (candidate 7864c1b83adea768f7394e29db0e6917de388fbc).
Targeted delivery: **partial / blocked on the waiver itself**. The chain-walk part is delivered; the waiver (the reader of a committed,
digest-bound approved low-rigor source) is NOT built, because the stop condition "approval evidence not recoverable from committed bytes
without a new signed artifact" holds. Design options below.

## 1. Part delivered: the chain walk reaches the real push decision

Question asked first: is the walk's push-step stop at "published Pipeline Continuity has no unambiguous runtime.sessionCleanup baseline" a
fixture artefact or a real consumer failure?

**Fixture artefact.** `guard-push.mjs` `portableCleanupBaselineFailure` (~1975) runs `git show <pushed commit>:<state path>` and returns
`null` when there is no State at the pushed commit. The walk's `commitPaths` used `git add -f -- .` for its two whole-tree commits (the base
commit and the repository-root genesis commit), which force-added the consumer-gitignored `.claude/pipeline-state.json` into the pushed tree.
That State has a `continuity` object without `runtime.sessionCleanup`, hence the stop. A real consumer gitignores the State (the onboarding
writes `/project/pipeline-state.json` into `.gitignore`; `/.claude/pipeline-state.json` is the walk's own spelling).

Change (test file only, `lib/pins/critic-course-consumer-chain-walk.test.mjs`): `commitPaths` adds a whole-tree `"."` commit WITHOUT `-f`
(the explicit-path commits keep `-f`). No other base file is gitignored (`/scratch/`, the captured `*-targeted-*.log`, the State).

With the real consumer shape, the push step of Path C walks to its true answer. Before (old assertion, new fixture; log
`c1-pathc.*.log`): the guard no longer answers with the Continuity baseline text; it answers
`candidate-bound independent review and Verify are unavailable (verify-evidence-not-exact-green)`, i.e. the pushed-state review decision
is reached and says "review required". Path C now pins (restated with intent and D214, not weakened):

- the pushed commit carries no project State file (`ls-tree`);
- both guard runs (State in the working tree, State absent) refuse with the review text and no longer with the Continuity text;
- the typed answer of the review decision for the closing feature, from the exported resolver with the pushed-tree reader (the guard's own
  refusal prints `inspectCriticBoundVerify`'s code, not the review code, so the typed code is asserted through the resolver):
  `{ required: true, code: "REVIEW-STATE-UNAVAILABLE" }`;
- control: the same candidate read through the gitignored State file is `{ required: false, code: "REVIEW-LOW-RIGOR" }` (the State-file
  route is unchanged);
- stated explicitly: the Critic COURSE and the review WAIVER are different questions. The course's feature (`held-feature`) has a registered
  package with integer rigor 2, which is `REVIEW-PACKAGE-REQUIRED` regardless of any approval; the waiver reads only the closing feature's
  approved low-rigor State.

Result: 8/8 green in the clone (`c1.critic-course-consumer-chain-walk.test.mjs.log`), including Paths A, B and C and the three negatives.
The multi-round Critic-course paths still pass.

## 2. Part not delivered: the waiver reader (D214). Why the stop condition holds

What the waiver needs: a provable "this exact plan and spec digest was approved at low rigor (profile mini), no registered package", read
from committed bytes at the pushed commit. What a consumer commits for a mini feature, and what each source carries:

| Source | Committed in a consumer? | Carries | Why it cannot ground the waiver |
|---|---|---|---|
| `specs/<f>/lifecycle.json` (feature package) | yes | `feature.rigor` integer 1 or 2, `state`, artifact digests | rigor is never "low" (1 or 2, even for mini; the resolver returns `REVIEW-PACKAGE-REQUIRED` for both); `state: approved` is a claim the file makes about itself, bound to no PO act. A package is today always `REVIEW-PACKAGE-REQUIRED`. |
| `prd_*.md` markers | yes | `po-language`, `technical-spec-sha256` (binds `spec.md` bytes), `po-plan-acknowledged: content-sound-and-spec-consistent` | no profile/rigor, no approval event; the acknowledgement marker is inserted by a sanctioned route on the caller's attribution (`--by`) and says the content is sound and spec-consistent, not that the plan was approved at low rigor. |
| `planSubmission` / `planApproval` | NO, only in the gitignored State | profile, submission digest, approver, authority digests | this is the source D214 wants to leave. |
| bootstrap acknowledgement receipt + Ed25519 proof | NO, `scratch/` (ignored) | intent digest over PRD preimage and spec sha, signer key reference; verifiable against the committed trust anchors | exists only in the shared-policy/signature bootstrap route, and signs the PRD acknowledgement, not the profile. Chat-mode receipt is unsigned. |
| private store (`.git/agent-pipeline`) | no | no record of a mini approval was found; `committedGlobalChatHumanApproval` only reads the committed approval-mode setting | nothing to cross-check a committed receipt against. |

For a mini approval by `approve-plan --by <name>` (chat/legacy), the only evidence ever produced is the attribution inside the ignored State.
There is therefore nothing signed or private-store-backed that a committed file could be digest-bound to. Any committed file the sanctioned
writer would emit (a receipt) is unauthenticated, and `specs/` is agent-writable (draft-exempt prefix): an agent could commit a forged
receipt and obtain a waiver of the independent Critic plus exact-green Verify, the failure the waiver must never allow ("never from a claim a
file makes about itself"). Building it would therefore either weaken the waiver or need a new ceremony. Per the briefing: stop, design options.

## 3. Design options for the PO (what must be committed, who writes it, what it binds, size)

**Option A - signed receipt (recommended if the waiver must reach consumers).** `approve-plan` for a mini submission (inside the existing
transaction, in the `afterValidation` slot where `persistAcceptedContractEnvelope` already writes an epic/feature envelope) additionally
writes `specs/<feature>/evidence/plan-approval-<submissionSha256>.json`: `{schema, featureId, profile, submission (the validated
planSubmission), approval digest, planSha256, specSha256, signer + proof}` (about 1-2 KB). It binds the exact plan and spec digests and the
profile. Only the signed variant is accepted by the reader: the proof is verified against the committed critical-proof trust anchors
(`verifyAgainstTrustAnchors`, as `observeOnboardingBootstrapPlanApproval` does) over an intent that covers `{profile: mini, submissionSha256,
planSha256, specSha256}`. Needs: a new signed intent kind for the plan approval (a new PO signature ceremony per mini approval; chat mode
stays `required`), the writer change in the protected `scripts/pipeline-state.mjs`, the reader in `lib/publication-review-requirement.mjs`
(additive; consulted only when the pushed commit has no State), and a hook change in `guard-push.mjs` (`pushedStateRequiresReview`).
Registered-package features stay `REVIEW-PACKAGE-REQUIRED` unless the package carries a new "low" rigor value (a schema change).

**Option B - package rigor 0.** Allow `feature.rigor: 0` in `lifecycle.json`, created only through the package registration writer after an
approved mini plan, with the plan approval digest in the package. Smaller reader change, but `state: approved`/the digest is still a
self-claim unless the same signed proof is embedded (then it is Option A with a different file).

**Option C - keep strict.** The documented alternative of D214: consumers keep the independent review for every push; the onboarding-v3
seeded gate and SECGATE-1 cases are made green by seeding the evidence a consumer really has (a Critic-bound Verify record) instead.

Not recommended: committing the State file (rejected in D214), or reading the working-tree State at push time (that is the ignored-State
route D214 replaces; it also makes the answer depend on the pushing machine).

## 4. Pre-existing reds, before and after (nothing in production changed, so before = after)

Baseline clone (`base1.*.log`), `project-onboarding-v3.test.mjs`: three FAIL lines:
1. `the seeded push gate refuses an unapproved push and admits it after the shipped commands` - two findings: `candidate-bound independent
   review and Verify are unavailable (private-critic-binding-unavailable)` and `Push approval missing: project/pipeline-state.json does not
   exist`. The seed has no feature at all, so even a working waiver would not obviously turn it green; the second finding is an independent
   cause to measure in its own slice.
2. `the seeded security gate ... (SECGATE-1)` - red in the same chapter.
3. `a local kickoff provisions its PO profile inside the confirmed kickoff action` - `ENOSPC` on the shared `/tmp` while three suites ran
   concurrently; transient, not a defect of this slice (tmpfs was at 50 percent afterwards).
`security-scan.test.mjs`: one FAIL (`CLI: all scanners skipped does not report a clean scan`, the host has no semgrep/gitleaks on PATH;
environmental, unrelated). `publication-review-requirement.test.mjs`: 4/4 pass. `security-completeness-gate.test.mjs`: no FAIL.
After the patch: the same, since the patch only edits the walk test.

## 5. Callers and pins (downstream sweep)

No export, code or refusal text changed. `resolvePublicationReviewRequirement` callers (guard-push `pushedStateRequiresReview`, push-prepare,
close-coordinator) are untouched and answer the same question the same way; pinned by `publication-review-requirement.test.mjs` (4 cases,
unchanged), `guard-push.test.mjs` (R1/R1b fixtures with a committed approved low-rigor State, unchanged) and now the walk.
`harness/scripts/check-verify-case-completion.test.mjs`: no pinned count moved (no case added to a registered file).

## 6. Housekeeping

- The walk file `lib/pins/critic-course-consumer-chain-walk.test.mjs` is not listed in `harness/verify-suites.json` (a protected path, TP-13);
  it needs registration by the PO/Coordinator to run under Verify.
- Kernel/protected files in the patch: none (only the walk test file).
- Revert proof: the fixture fix is a test-file change; the "before" run (old `-f` fixture) is the candidate walk with its recorded
  Continuity-baseline answer (the candidate's own pin), the "after" run is 8/8. No production file was edited, so there is no production
  revert to prove.
