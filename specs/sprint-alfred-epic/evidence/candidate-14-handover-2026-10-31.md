# Candidate 14 handover (2026-10-31): the whole consumer chain, local, not applied, not stamped

PO direction that shaped it: a fix must carry the WHOLE consumer chain, not the reported step. Earlier rounds repaired the step a consumer
reported and the consumer then failed at the next step of the same chain (bindings range, finding role, residual acceptance, course chain,
push). This candidate adds a chain walk that drives the real entry points from the first Critic round to the push decision and treats the first
red step as the work item.

## What the stack contains (seven patches, apply order, `scratch/po-apply-0.7-candidate14.sh`, rehearsed clean on HEAD)

| # | Held patch | Effect |
|---|---|---|
| 1 | `w8-n35-addendum-residual-acceptance-and-course-chain` | the close addendum binds a failed receipt when a valid PO residual acceptance of exactly its minor findings exists, and covers a record through the union of the registered rounds of the course whose last round it names (D217 A+B) |
| 2 | `w8-cib-d213-full-fallback-bindings-and-finding-records` | the correction-input bindings of an effective full round are judged over the course genesis base to the candidate; the finding-disposition role has a producer (the project's `criticFindingRecordPaths`, D213) |
| 3 | `w8-d215-mini-plan-acknowledgement-is-the-first-approval` | text and pin comment: the early mini plan acknowledgement is the first of two per-feature approvals (D215) |
| 4 | `w8-chain-walk-critic-course-consumer-paths` | the whole-chain walk (3 consumer-shaped paths, 5 negatives); its first red step was the course reader: the chain reader knew only lineage v1 rows, the current registration writes v2 |
| 5 | `w8-d214-committed-rigor-source-for-the-push-review-waiver` | NOT the waiver: the walk's push step gets the real consumer shape (no State at the pushed commit) and reaches the review decision |
| 6 | `w8-chain-walk-suite-registration` | registers the walk in `harness/verify-suites.json` |
| 7 | `w8-empty-tree-course-base-in-the-close-coverage` | a course whose round 1 is a root-candidate review (base: the empty tree, a greenfield consumer's normal start) is covered by the close; before, git refused the tree as a base and the close ended in `CLOSE-CRITIC-EVIDENCE-MISSING` |

## Evidence

- Walk 8/8 and 17 further focused suites green on the full stack (committed HEAD of the rehearsal clone), plus 20 canon and script suites
  from the wider sweep; baseline comparison per slice in the slice notes.
- **Full Verify of the stack in a clone** (`scripts/full-verify.mjs`, candidate mode, no reuse, private HOME; stack of seven patches plus the
  rebaseline) against the same run on the unpatched HEAD: 1128 steps / 89 red against 1127 steps / 89 red, and the two sets of red step
  names are identical (the one extra step is the chain walk, green). The first stack run found three red steps the baseline does not have: two
  were real (the walk's registration lacked the product capability inventory entry, fixed in the registration patch, both steps green with
  17 and 30 cases) and one was an existing flake (`pin-hgo-stale-capability-shadows-current-authorization`, AC2: the same commit was red on
  one parallel worker and green on the other; it was green in the second run). The 89 shared reds include the Critic protected-preimage
  step, GST33 and the onboarding-v3 push gate cases named below. This is a pre-stamp clone run, not the formal Verify of the installed candidate.
- Walked with real entry points: bindings derive, dispatch preflight, admission, finalizer, lineage registration, addendum per record,
  close coordinator up to `feature-close-prepared`, and the push decision.
- Not driven, named: Full Verify, batch Critic, native Windows runs, the real consumer repositories, a real signature, a real model call,
  `closed-local` (needs final Verify and cleanup).
- Measured, not a gap: the retained-course search costs about 23 ms per feature (3 manifest commits) to about 100 ms (40 manifest commits),
  at most 256 features, once per HEAD and packet, only after the single-receipt test failed (worst case roughly 25 s, typical consumers
  milliseconds). The empty-tree course base was a real gap and is closed by patch 7 (the walk and the coverage suite stay green).

## Open, with the owner

- **PO decision, D214 mini waiver** (`backlog/items/2026-10-31-push-review-waiver-has-no-committed-approval-evidence.md`): options A (signed
  receipt), B (package rigor 0), C (keep strict). Until decided, a mini feature without a Critic needs the independent review and an exact-green
  Verify to push; the walk shows this is the normal route for a Critic-course feature.
- **D216 stopped** (`held-patches/w8-d216-preflight-read-only-admission-closure.notes.md`): moving the preflight's review admission into a
  read-only module needs eleven read/write splits (limit four); options A widen the scope, B inject the heavy readers, C change the
  read-only list (forbidden by the briefing). GST33 stays red meanwhile.
- **Critic protected-preimage pin** (`codex-isolated-critic-protected-preimage.test.mjs`): already red on the unpatched HEAD for four
  Critic canon files; the stack adds `harness/review-protocol.md` (D213 wording). It is a tamper tripwire; per `guardrails/quality-gates.md`
  the party that changes the canon does not re-pin it. Re-pin after the independent batch Critic review, with the PO.
- **`docs/state.md` is at its hard size cap** (29487 of 30000 bytes): this candidate's status could not be added there; a rotation (with
  the extraction pass) is a prerequisite for the next state edit.
- **Matrix**: the rows of the three items filed on 2026-10-31 (bindings range and finding role, close addendum, push review waiver) join the
  matrix after the install, as for candidate 13; nothing is lifted before.
- Stamp, install, Full Verify, batch Critic, native runs and PO acceptance are all still open.
