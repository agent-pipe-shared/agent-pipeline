# w30j05 — one definition of an evidence-only commit; the discard record at the candidate is not built (candidate 30j, C30J-J5, analysis C12 / SM-10 and C9 / SM-7)

Edits `plugins/pipeline-core/lib/critic-course-admission.mjs` and `plugins/pipeline-core/lib/critic-diagnostic-evidence.test.mjs` only. The other files of the write list are untouched (`critic-diagnostic-producer.test.mjs` does not exist). Criterion binding: AC-112 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text; that text names another item); the PRD and the Spec are unchanged. The patch is a delta on the integrated 30i tree: apply that tree first, then this patch. It does not apply to the real checkout alone; `git apply --check` was exit 0 against the integrated 30i clone.

## Part (a), C12: what it changes

- `EVIDENCE_ONLY_PROFILES` (frozen) names the three flag sets the callers already used:
  - `counters`: registrations only (course counters, `classifyRegisteredEvidenceOnlyCommits` without the carry option);
  - `carry`: registrations, the export of a consumed review, a disposition addendum, the close commit and the administration pass-over (the same function with `admitCriticExports`);
  - `followers`: registrations, export and addendum, never the close commit or an administration commit (the Critic diagnostic's HEAD, `classifyEvidenceOnlyFollowers`).
- `evidenceOnlyKind` (private) is the single per-commit decision, `"registered"`, `"administration"` or `null`. It replaces the old private helper `registeredEvidenceOnlyCommit` and the inline administration test of `classifyRegisteredEvidenceOnlyCommits`. Both walkers call it with their profile.
- `classifyEvidenceOnlyCommit({ repoRoot, featureId, commit, profile })` is a new export that wraps `evidenceOnlyKind` (resolves the repository, never throws, refuses malformed input). It exists so the definition can be read and tested; the production callers use `evidenceOnlyKind` directly. A profile that is not one of the three named objects (by identity) classifies nothing as evidence-only, so no caller can invent a wider flag set.
- `classifyEvidenceOnlyFollowers` and `classifyRegisteredEvidenceOnlyCommits` keep their names, arguments and result shapes (the diagnostic leaf installs the first; `critic-verify-lifecycle.mjs` calls the second).

Why the two range walks stay: the follower check cannot simply call `classifyRegisteredEvidenceOnlyCommits`. By reading `deriveRegisteredCriticCourseSource` (read, not run): it first derives the retained course and refuses `CCA-PARENT` when the last retained candidate is not the base, and a diagnostic for a NEW candidate has the previous round as its last retained candidate; it also needs a non-empty range. So the single definition is the shared per-commit core, not the range walk.

## Part (b), C9: not built

Precondition (E2-10), "is the State a TRACKED file in a consumer project?". Evidence for "no, by design":
- the onboarding seed (`PROJECT_IGNORE_SEED` in `lib/project-onboarding-v3.mjs`) writes `/project/pipeline-state.json` into the `.gitignore` of a project that has none, with the reason (it changes on nearly every command and re-committing it can invalidate a signed, commit-bound approval);
- a project that already owns a `.gitignore` is asked to add the same line (`REQUIRED_PROJECT_IGNORE_PATTERNS`);
- the registration guard names it "the gitignored project State" (`lib/feature-package-registration.mjs`); the consumer chain-walk pin builds a consumer repository with "the project state file gitignored"; the State writer prints "Keep the private State untracked".
Evidence that a tracked State is tolerated, not expected: `CLOSE_STATE_FILES` lets a close commit change the State path (this repository tracks its own State), and the ignore seed lists only the neutral path, not `.claude/pipeline-state.json` (the legacy tier). The two `pipeline-state.mjs` places that talk about tracked or untracked paths (`AUTHORITY-WORKTREE-HEAD-DIVERGENCE`, a tracked/ignored probe of design-review paths) concern plan, spec, PRD and review receipts, never the State. No writer or guard requires a tracked State.
Verdict: for the supported default shape the State is not tracked, so `git show <candidate>:project/pipeline-state.json` has nothing to read and the change would not help the reported case (another machine); a committed State would also turn a committed file into the authority for the PO's discard decision. Nothing was built. `discardedFeatureIds` and `CCA-ALIAS-MAPPING-UNAVAILABLE` are unchanged and the manifest field `supersedes` (30i writer) stays the carrier. This is "void for the default shape, not proven void for a legacy-tier project that tracks its State by choice": the Coordinator decides whether that residue needs anything.

## Tests

Written first in `critic-diagnostic-evidence.test.mjs`, a plain node:test file, so it adds no assertion site to `critic-course-admission.test.mjs` (its 353 sites are pinned in `harness/scripts/check-verify-case-completion.test.mjs`, outside the write list). RED on the original code: 39 tests, 36 pass, 3 fail (`C30J-J5 (a)`, `(c)`, `(d)`: the definition and the profile table did not exist). The RED is the missing single definition; there was no behaviour bug to reproduce. Case `(b)` was GREEN already on the original code by design: a commit-kind truth table through the three existing callers (registration, export of a consumed review, source change, registration with a source change, close commit, administration-only commit), so it shows that the refactor changed no verdict for these six kinds. The export row is the only one that separates `followers` from `counters` and is covered through the injected receipt reader. GREEN after: 39 pass. `(d)` also pins that the exact capture head of a registered diagnostic still refuses a follower HEAD, and that the profile table has no package or Verify entry.

Verified by tests only: the Critic is suspended by the PO for candidates of this repository and no Full Verify ran.

## Not changed / not proven

- Every exact-HEAD check keeps its exact HEAD: the package candidate and the Verify evidence were not touched; the exact capture head inside `evidenceOnlyCommit` is unchanged; `critic-diagnostic-evidence.mjs` and the producer were not touched. No gate, signature, approval, Critic evidence, security scan or audit bundle behaviour, no stored status, record shape or digest changed.
- Two other per-commit rules were left alone on purpose: `evidenceCommitV2` (runtime admission and the lineage transport, gate behaviour) and `classifyVerifiedDeliveryTail` (the push gate's tail of handover and export commits).
- The producer's own extra check (the bound spec and guardrails stay byte-identical across the followers) stays in the producer.
- The disposition-addendum branch of the profiles is not covered by a truth-table row (its fixture needs an immutable dispatch record); it is the unchanged `criticAddendumOnlyCommit` call under the same `exports` flag.
- The protected Critic preimage inventory (`codex-isolated-critic-protected-preimage.v1.json`) does not list the two edited Critic files by name; no re-pin is needed on that evidence.
