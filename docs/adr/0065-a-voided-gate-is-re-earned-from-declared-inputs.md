# ADR-0065: a voided gate is re-earned from declared inputs, not preserved by a narrower binding

> Agent-Pipeline · Nova sprint (`sprint-nova-epic`) · as of 2026-08-17

**Status:** accepted (2026-08-17, PO instruction, chat: *"okay Freigabe für meine
Entscheidungen erteilt setze alles um"* — approval granted, implement
everything. Decision 8's own conservative default — push/release-bound Verify
runs force full re-execution, `--no-reuse`, buying no reuse benefit for the
release-gate case specifically — is accepted as-proposed absent a more specific
PO answer; this is the deliberately cautious reading, not a silent pick of the
more permissive alternative) · **Basis:** backlog item
`backlog/items/2026-08-16-every-gate-binds-the-whole-tree-so-any-later-commit-voids-it.md`,
whose Triage reads *"accepted — deferred to a dedicated design round, not this AFK
block"* and assigns *"a future dedicated design session, paired with
`pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost`"*; this is that
design round. The PO's general 2026-08-16 chat instruction (*"treffe im Zweifel
Annahmen"*) authorizes drafting under assumption, not accepting; the same Triage
records why this surface is Design-tier/Critic-mandatory per MP-07.
**Constrained by** [ADR-0050](0050-candidate-bound-verify-run-journal.md), whose
receipt and drift model this ADR reuses without amending its schema.
**Does not touch** [ADR-0055](0055-critical-human-proof-waiver.md)/[ADR-0056](0056-push-approval-mode.md)/[ADR-0061](0061-uniform-human-approval-ceremony.md);
see Decision 5.

**Governs:** harness/scripts/verify.mjs, plugins/pipeline-core/scripts/verify-journal.mjs, plugins/pipeline-core/scripts/verify-journal.test.mjs, plugins/pipeline-core/lib/verify-resume.mjs, plugins/pipeline-core/lib/verify-resume.test.mjs, plugins/pipeline-core/scripts/verify-resume-plan.schema.json, harness/scripts/check-verify-suite-registration.mjs, harness/scripts/check-verify-suite-registration.test.mjs, plugins/pipeline-core/scripts/push-prepare.mjs, plugins/pipeline-core/scripts/push-prepare.test.mjs, plugins/pipeline-core/hooks/guard-push.mjs, plugins/pipeline-core/hooks/guard-push.test.mjs, plugins/pipeline-core/scripts/security-scan.mjs, plugins/pipeline-core/scripts/security-scan.test.mjs

## Context

Three gate results bind to one exact commit as a whole.
`checkEvidenceFreshness` requires `data.exitCode !== 0` and
`data.commit !== sourceCommit` to both be false — `push-prepare.mjs:131-141`
and, byte-for-byte, `guard-push.mjs:1546-1561`. A push approval binds through
`state.pushApproval.lastApproved.forCommit !== sourceCommit`
(`guard-push.mjs:1711`) and, in `signature` mode, through a signed subject
carrying `candidate: {commit, tree}` (`guard-push.mjs:1747`). Security evidence
binds through `candidate.commit`/`candidate.tree`/`inputSha256`
(`guard-push.mjs:1599-1601`). None records what the gate read.

The cost is measured, not theorised. The one real cross-invocation exercise of
the Verify journal
(`specs/sprint-nova-epic/evidence/nova-a/a98/verify-resume-exercise-2f34c1cc.json`)
records a full run of 269 suites at `durationMs: 198753` — 3.31 minutes. During
a run of that length on 2026-08-16, a commit landed and voided it:
`docs/state.md:7170` records all 269 suites green with only the binding
meta-check failing, *"because a commit (`a67c3100`) landed on this same working
tree from elsewhere in this session … WHILE verify was running (~3.3 min run),
voiding the bind. … Evidence bound to `6ed531a8`, not current HEAD."* That is
this repository's own first-party reproduction of the defect. The working rule
it forces — one committer at a time — is the item's actual complaint.

**The item's own proposed shape does not survive contact with the evidence, and
that is this ADR's central finding.** The Direction section proposes that *"a
following commit whose diff touches nothing in that envelope preserves the
binding."* At gate level the envelope is the union of 269 suites' inputs, and
that union is very nearly the whole repository. The voiding commit `a67c3100`
touched exactly one file — a backlog item markdown, 57 insertions — and
`backlog/` is read by `check-backlog-state.mjs`,
`reconcile-backlog-ledger.mjs`, `check-doc-contracts.mjs` and
`check-artifact-lifecycle.mjs`, each behind a registered suite. The envelope
rule would therefore have voided the run anyway. The item's own warning about
`docs/state.md` — *"four registered gates read the handover file"* — is
corroborated (`guard-devplan.mjs`, `guard-lifecycle-ready.mjs`,
`guard-push.mjs`, `check-artifact-lifecycle.mjs`, and more), but it understates
the problem rather than bounding it: a repository whose gates read its own
documentation has almost no inert commits. **Preservation buys close to nothing
here. Cheap re-establishment buys everything**: 198753 ms versus 1838 ms for an
unchanged candidate, ~108x, on the harness's own self-report.

The mechanism to do that already exists, is tested, and was exercised for real
this session. `verify-resume.mjs` defines a validated per-suite input set —
`inputSet` requires sorted, non-empty `files: [{path, fileSha256}]` and
`nonFiles: [{kind, path: null, sha256}]`, each ≤256 (lines 28-34) — and
`firstDrift` (lines 61-76) discriminates eight distinct drift causes including
`declared-input-drift` (line 68). ADR-0050 already settled its authority,
privacy and retention. It does not need replacing; it needs three couplings
removed, because today it is bound to the whole tree three separate times:

1. **`verify-resume.mjs:66`** — `candidate-drift` is checked *before* any
   content check, so a differing commit or tree invalidates every receipt
   outright. The exercise evidence names this exact line in its own negative
   control: two runs one commit apart (`f377b3f4`, then `a3197af3`) produced
   *"ZERO reuse (269/269 fresh in the second run)"*.
2. **`verify-journal.mjs:328`** — `compileVerifySuites` gives *every* suite the
   non-file input `{kind: "candidate-tree", path: null, sha256: sha(candidateTree)}`.
   Every suite therefore declares the whole tree. The declaration is honest but
   useless: it can never narrow anything.
3. **`verify-journal.mjs:395`** — `policySha256` is a digest over *all*
   registrations, and `firstDrift` invalidates on `verify-policy-drift`
   (line 70). One suite's input changing thus invalidates all 269. This is the
   subtlest of the three: fixing only (1) and (2) would be silently defeated by
   (3).

That these three exist, and that the second is a declaration of the whole tree,
is why the existing mechanism has never delivered narrowing despite having the
right shape. Fixing them is not inventing a second mechanism; it is finishing
the first. Notably, none of the three lines is `guard-testpath`-protected —
TP-3's pattern is `harness/scripts/verify\.mjs$` alone
(`project/guard-config.json:15`) — so the whole change lands outside the TP-3
maintenance-window dependency that has blocked `NVA-VERIFYDUR-1`'s remaining
line all session (`docs/state.md:7233-7235`).

## Decision

A gate result is **not** preserved across a commit it did not observe. Instead,
Verify becomes cheap to re-earn against the new commit by reusing per-suite
receipts whose *declared inputs are provably unchanged*, with the declaration
enforced at runtime where it is narrowed and defaulted to the whole tree where
it is not. `checkEvidenceFreshness` is unchanged. Security evidence and
push approval are out of scope, for different and stated reasons.

Clarification:

- **1. What a suite declares, and in what artifact.** Verify suites already
  declare; the declaration's *content* changes and its *schema* does not.
  `compileVerifySuites` (`verify-journal.mjs:312-333`) stops emitting the
  `candidate-tree` non-file input and instead emits, per suite:

  ```
  files:    [ <the suite implementation file>, ...<declared individual files> ]   // sorted by path, ≤256
  nonFiles: [ { kind: "declared-tree:<slug>", path: null, sha256: <git ls-tree -r -z digest of that subtree at the candidate> },
              { kind: "suite-arguments",      path: null, sha256: digestJson(suite.args ?? []) },
              { kind: "suite-dependencies",   path: null, sha256: digestJson(suite.dependsOn) } ]   // sorted by kind
  ```

  Every element is legal under the *existing* validator: `kind` matches
  `ID` (`verify-resume.mjs:12`, which admits `:` and `-`, so
  `declared-tree:backlog` is valid while a `/`-bearing label is not — the label
  is a slug, the path lives in the registration); `nonFiles` stays non-empty as
  `inputSet` demands (line 32); the ≤256 `files` bound is respected because a
  directory-scale input is declared as one subtree digest rather than 256
  individual files. **No schema version changes** —
  `pipeline.verify-suite-receipt.v1`, `pipeline.verify-resume-plan.v1` and
  `pipeline.verify-progress.v1` all keep their exact key sets
  (`ROOT_RECEIPT_KEYS`, `verify-resume.mjs:14`).

  `suite-dependencies` is not decoration. `policySha256` shrinks to
  `{schema, maxLogBytes, policyInputs}` — dropping `suites: registrations`
  (`verify-journal.mjs:395`) — which removes coupling (3). Everything that
  digest contributed per-suite is already checked per-suite by `firstDrift`:
  `id` (line 65), `implementationSha256` (67), `inputs` (68),
  `environmentContractSha256` (69). The single exception is `dependsOn`, which
  nothing compares today; carrying it as a non-file input restores that check
  inside the existing shape rather than adding a receipt field.

- **2. How the declaration is verified rather than trusted, honestly.** There is
  no read-tracing, sandboxing or syscall interception anywhere in this
  repository today; suites are plain `spawnSync(process.execPath, [suite.file, ...args])`
  with no restriction (`verify-journal.mjs:345`). So the item's consequence 2
  cannot be met by inspection, and this ADR does not pretend otherwise. It is
  met by a **two-tier declaration in which only the enforceable tier may
  narrow**:

  - **Tier A — undeclared (the default, and where every suite starts).** The
    suite declares `declared-tree:` over the repository root. Behaviour is
    bit-identical to today: any commit produces `declared-input-drift`, the
    suite re-runs, nothing is reused across candidates. No new trust is
    extended, because no narrowing is claimed.
  - **Tier B — narrowed, and enforced at runtime.** The suite runs under Node's
    permission model: `node --permission --allow-fs-read=<each declared path>
    --allow-fs-write=<the run's own scratch> <suite.file>`. A read outside the
    declaration fails with `ERR_ACCESS_DENIED` and the suite fails. This is real
    enforcement by the runtime the suite already runs on (v24.19.0, confirmed
    live), not a convention. **A Tier-B suite may not pass `--allow-child-process`**,
    because that flag disables the protection for children and would make the
    declaration exactly the lie the item warns about. That restriction is
    load-bearing and expensive: **113 of this repository's `*.test.mjs` files
    import `node:child_process`** (measured by `rg -l`, 332 files searched), and
    every one of them stays Tier A until it is refactored or accepted as
    permanently whole-tree.

  The honest summary: full runtime verification is achievable, but only for the
  subset of suites that do not spawn. Rather than weaken the claim to cover the
  rest, the rest keep today's guarantee unchanged. A declaration that cannot be
  enforced is not accepted at a narrower scope than the tree.

- **3. Selective execution is permitted only for working Verify runs, with a
  full boundary before candidate and push.** The PO-approved shape is a lower-
  assurance work tier, not a replacement for the gate. A working run may use
  the deterministic selective set below; a candidate- or push-bound run MUST
  include every registered suite and retain the exact candidate binding and
  freshness checks. A selective run can never produce candidate/push evidence;
  omission is not reuse because omitted suites have no terminal receipt.

  **Membership rule.** A suite is eligible for the working selective set only
  when its registration has (a) a stable suite id, (b) a complete declared
  input set, (c) an enforceable runtime declaration, and (d) a passing fresh
  `durationMs`. The set is the union of suites whose declared inputs intersect
  the changed-input closure since the previous work receipt and an explicit
  always-run set for invariants that cannot be localized. The closure includes
  the implementation, arguments, dependencies, environment contract, declared
  files/non-files, and registration/policy inputs. Missing metadata, reused-
  only or failed evidence, ambiguous ownership, or an input outside the
  declaration makes a suite ineligible and therefore full. No name-based
  exception may make an otherwise ineligible suite selective.

  **Evidence and acceptance.** A selective work artifact records `mode:
  "selective"`, sorted `registeredSuiteIds`, `selectedSuiteIds`,
  `omittedSuiteIds`, a digest of the changed-input closure and selection rule,
  and per-suite `exitCode`, `durationMs`, `reused`, and declared-input digest.
  Acceptance requires the lists to be disjoint and exhaustive, stable sorting,
  every selected id to satisfy the membership rule, and no candidate/push
  `passed` result unless `mode: "full"` and selected count equals registered
  count. Existing receipt validation remains authoritative; `reused: true` is
  never actual measured suite cost.

  **Full-gate boundary.** Candidate freeze/preparation and every push preflight
  MUST invoke full Verify at the candidate commit with no selective omission.
  Full acceptance requires one terminal result for every registered suite,
  exact start/finish candidate binding, zero exit failures, and evidence bound
  to that candidate. Any later commit voids it, even when it misses every
  declared input; the result must be re-earned. Push approval and security
  bindings remain unchanged.

- **4. `checkEvidenceFreshness` does not change, and nothing becomes
  schema-incompatible.** `push-prepare.mjs:131-141` and
  `guard-push.mjs:1546-1561` keep `exitCode === 0 && commit === sourceCommit`,
  character for character, and `push-prepare.mjs:95-101`'s comment that the two
  match exactly stays true. `evidence/verify-latest.json` keeps
  `pipeline.verify-evidence.v0` and every field including `candidate.binding`.
  `evidence/security-latest.json` keeps `pipeline.security-evidence.v1` and is
  not touched at all. What changes is only the *cost* of producing evidence
  bound to the current HEAD after an unrelated commit lands. The one real
  migration cost is a single full run: existing receipts carry the
  `candidate-tree` non-file input, so at rollout every suite reports
  `declared-input-drift` once and re-runs — 3.3 minutes, paid once, on the
  mechanism's own conservative default.

- **5. Security evidence and push approval are out of scope, for two different
  reasons, both resolved rather than deferred.** *Security* is already
  conformant and cannot be narrowed: its declared input is constructed as the
  digest of `git ls-tree -r -z --full-tree HEAD` over the whole tracked
  inventory (`security-scan.mjs:284-300`), it is bound as
  `candidate.inputSha256`, and `evidence/security-latest.json` names its own
  subject `"candidate-tree"` verbatim. A secret scanner that reads only some
  files finds only some secrets; narrowing would not be an efficiency, it would
  be a defect. Security needs no new field and gets none. *Push approval* is
  out of scope permanently and deliberately: a human signed a specific
  `{commit, tree}` (`guard-push.mjs:1747`), and re-scoping that signature to a
  set of paths would let commits the human never saw ride an old signature to
  the remote. The asymmetry is the whole point — a **computed** gate may be
  re-earned automatically because the computation can be redone; a **human**
  gate cannot be re-earned without the human, so the only way to make it
  "cheaper" is to make it mean less. This ADR refuses that trade and leaves
  ADR-0055/0056/0061 untouched.

- **6. Guard-class gates (TP-\*, GS-\*) are out of scope as a structurally
  different mechanism.** `guard-testpath.mjs` is a PreToolUse deny-guard over
  Edit/Write against `protectedTestPaths` (`project/guard-config.json`, TP-1
  through TP-10). It evaluates in real time, produces no artifact, has no
  commit binding, and therefore has no result that a later commit could void —
  there is nothing here for a binding envelope to bind. Its own header already
  scopes it honestly as a *"tripwire-not-a-sandbox"* with a documented
  unguarded path (`guard-testpath.mjs:79`). Declared-input binding is an
  after-the-fact evidence-freshness concept and does not apply. Naming this
  explicitly so a later reader does not read silence as omission.

- **7. The top-level Verify binding stays `exact`; it is not given a
  declared-input model.** `harness/scripts/verify.mjs:554-561` compares the
  candidate observed before the suites against the candidate observed after,
  and emits `binding: "drift"` on any movement (line 577). That is a *wall-clock
  stability* check — "did the tree move under me" — not an input binding, and
  the two are not interchangeable. It should keep failing closed exactly as it
  does. It inherits this ADR's benefit not as tolerance but as cost: after a
  drift, the re-run reuses every receipt whose inputs did not change and
  re-establishes `binding: "exact"` in seconds instead of minutes. Applying the
  `a67c3100` incident to the proposed mechanism: that commit touched `backlog/`,
  so the four `backlog/`-reading suites would re-run and the remaining ~265
  would be reused — the gate is still voided and still honestly re-earned, but
  the re-earning is cheap. `verify.mjs` is TP-3 protected, and this decision is
  precisely why no change to it is required.

- **8. Candidate and push remain full even when work is selective.** The PO
  approved this boundary on 2026-08-19. Cross-candidate reuse may remain an
  optimization inside a full run only when every registered suite still gets a
  terminal, input-validated receipt; it must not turn a candidate/push run into
  a selective run or relax any release policy requiring fresh execution. This
  design authorizes no change to `verify.mjs`, candidate freshness, or push
  approval.

- **9. Current data does not support a safe named selective set.** The current
  `evidence/verify-latest.json` contains 383 suite steps, but 379 are reused
  receipts and only four have fresh `durationMs`; three of those four fail.
  Reused receipt time is not measured suite cost, and failed fresh evidence
  cannot establish eligibility. The smallest next measurement is one stable,
  successful full Verify run at the intended candidate baseline with every
  suite fresh (`reused: false`), preserving each suite's `durationMs`, declared-
  input digest, and exit code. Until that artifact exists, no named selective
  membership list is safe; unmeasured or failed suites remain full by rule.

## Consolidation rule

Every proposed new Verify suite must name exactly one invariant, its owner, its
declared inputs, and the existing suite or suites checked for overlap. Admit it
only when no existing suite already pins that invariant at the same boundary;
otherwise extend the owner suite or consolidate into one stronger replacement,
not a duplicate. The proposal must include a deterministic acceptance check, a
fresh measured duration, and a receipt/input declaration. A suite that merely
restates an existing invariant, differs only in fixture or assertion wording,
or cannot declare and enforce its inputs is rejected or folded into the owner.
Removing or merging an existing suite requires evidence that the survivor still
covers the invariant. Consolidation never permits deleting a candidate or push
full-gate check merely to reduce cost.

## Consequences

**Positive:** the serialization rule dissolves without any gate being weakened —
a commit landing mid-run still voids the run, exactly as today, but the next run
costs the drifted suites instead of all 269. The measured ceiling is the
exercise's own ~108x for an unchanged candidate, with the realistic case
between that and a full run depending on what the commit touched. One mechanism
serves both filed items: this is literally part 2 of
`pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost` ("declare
per-suite inputs"), and per-suite `durationMs` — landed this session as
`ce9bf7e1` (`docs/state.md:7233`) — becomes the instrument that shows which
declarations are worth narrowing first. No schema version moves, no evidence
artifact changes shape, `checkEvidenceFreshness` is not edited, and none of the
three change sites is TP-protected, so the whole change is dispatchable without
a Guard Maintenance Window.

**Negative:** the repository acquires a per-suite declaration to maintain, and a
stale declaration is a real failure mode — a Tier-B suite whose reads move fails
with `ERR_ACCESS_DENIED` rather than a test assertion, which reads as an
infrastructure error until the reader learns the tier system. Tier B excludes
113 spawning suites, so the majority of the suite set gains nothing at first and
the benefit arrives gradually rather than at rollout. `readPriorReceipts`
considers only the most recent prior run holding a given suite and stops
(`verify-journal.mjs:283-307`), so an older run whose receipt *would* match is
never consulted — reuse is conservative and will sometimes be missed for no
visible reason. Rollout costs one full 3.3-minute run. And a future reader must
now know that `policySha256` covers less than its name suggests, with the
per-suite half moved into the receipts.

**Risk:** the narrowing is the new trust boundary. A Tier-B suite that reaches a
file through a path the permission model does not mediate — a spawned child, a
native addon, an environment variable carrying content, a network fetch — would
have a declaration narrower than its true inputs, and a stale PASS would look
identical to a real one in the sealed record. This is exactly the "envelope is a
lie" failure the item names, and it is why Tier B forbids `--allow-child-process`
rather than merely discouraging it, why Tier A is the default, and why the
`environmentContractSha256` check (`verify-resume.mjs:69`) is retained
unchanged. Mitigated further by requiring, before any suite is promoted to Tier
B, a negative corpus proving that suite fails when an undeclared read is
introduced. Secondary risk: dropping `suites: registrations` from `policySha256`
is the one change that *removes* an invalidation edge, and if `dependsOn` were
not carried forward as `suite-dependencies` it would silently stop being
checked — this is the single most reviewable line in the change and should be
the Critic's first stop.

## Alternatives considered

- **Implement the backlog item's Direction section as written — void a gate only
  when a commit touches its envelope.** Rejected on this repository's own
  evidence, not on taste: the union envelope of 269 suites is effectively the
  whole tree, and the exact commit that motivated the item (`a67c3100`, one
  backlog markdown file) falls inside it because four registered checkers read
  `backlog/`. The rule would have voided the run it was designed to save, while
  introducing a preservation claim that must be verified. It costs the same
  trust and buys measurably less.
- **Exempt documentation commits.** Rejected by the item itself, correctly, and
  independently confirmed here: `docs/state.md` is read by `guard-devplan.mjs`,
  `guard-lifecycle-ready.mjs`, `guard-push.mjs` and `check-artifact-lifecycle.mjs`
  among others, and `governance/observation-doc-governance.json` — the file
  `a3197af3` touched, one line — is a genuine input to the doc-contract and
  observation-governance suites. A file-type exemption would be a guarantee this
  repository does not hold.
- **Build a second, gate-level declared-input mechanism alongside the suite-level
  one.** Rejected: `verify-resume.mjs`'s `inputSet`/`firstDrift` is tested,
  ADR-0050-governed, and was exercised end-to-end this session with sealed
  evidence. A second mechanism would need its own validator, its own drift
  vocabulary and its own negative corpus, and would create exactly the "second
  source of truth for what the candidate is" that a prior Critic finding already
  called out in `guard-push.mjs:1575-1580`.
- **Narrow Security evidence to changed files.** Rejected on semantics, not
  effort: a scanner that reads a subset finds a subset. Its declared input
  legitimately is the whole tracked inventory
  (`security-scan.mjs:284-300`), and it already says so.
- **Let a push approval bind declared paths instead of a commit.** Rejected as
  the one narrowing that would trade real authority for convenience: it would
  let unreviewed commits ride a signature the human gave for a different tree.
  A human gate cannot be made cheaper without being made weaker.
- **Bring TP-\*/GS-\* guards under the same declared-input model.** Rejected as a
  category error — a real-time deny-by-default write guard has no result to void.
- **Relax `verify.mjs`'s start/finish candidate-stability check so mid-run
  commits stop producing `binding: "drift"`.** Rejected: it is the only thing
  that detects a tree moving under a running gate, it is cheap, and this ADR's
  whole premise is that the honest answer to drift is a cheap re-run, not a
  tolerated one. It also would have required editing a TP-3 path.
- **Trust declarations by code review at gate-definition time instead of
  enforcing them at runtime.** Rejected as the *default*, because the item's
  consequence 2 is right that an unverified envelope is weaker than the binding
  it replaces. Kept in substance for Tier A, where nothing is narrowed and so
  nothing needs verifying — which is the honest form of the same idea.

## Follow-up

Proposed 2026-08-17; a human must accept it before it is cited, and the PO must
answer Decision 8 before any push- or release-bound run reuses a receipt. On
acceptance, dispatch in three ordered candidates, each Verify/Security/Critic-bound,
none requiring a Guard Maintenance Window: **(a)** break the three couplings —
`verify-journal.mjs:328` (drop `candidate-tree`, add `suite-dependencies`),
`verify-journal.mjs:395` (shrink `policySha256`), `verify-resume.mjs:66`
(`candidate-drift` demoted from a pre-emptive check to one that no longer gates
the content checks) — with every suite still declaring the repository root, so
behaviour is provably unchanged and the negative control from
`verify-resume-exercise-2f34c1cc.json` (two candidates one commit apart, zero
reuse) still reproduces; **(b)** add the Tier-B runner flags and promote a
single small non-spawning suite, with a negative corpus proving an undeclared
read fails it; **(c)** narrow further suites individually, ordered by the
per-suite `durationMs` that `ce9bf7e1` now records. Update
`docs/adr/README.md`'s table and Resubmissions, and — the gotcha that cost this
session a full Verify run on 2026-08-16 (`docs/state.md:7183`, fixed by
`a3197af3`) — register this file in
`governance/observation-doc-governance.json` in the same commit that creates it,
or `check-doc-contracts.mjs` will fail with `OG-DOC-UNCLASSIFIED`. Both backlog
items stay open: this pass supplies the design for parts 3 and 4, while
implementation, a named membership list, and the fresh measurement remain
outstanding. Resubmit with the first real measurement of a Tier-B narrowing
against a live mid-run commit, or by **2026-09-30**, whichever is first.
