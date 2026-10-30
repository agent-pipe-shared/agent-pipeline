# A push review of a feature with course history names its base and a route that admits (CCA-PARENT)

Held patch `w7-cca-parent-push-review-route.patch`. Dispatch W7-CCA-PARENT-PUSH-REVIEW-ROUTE-20261030 (goldfish)
built it in the scratch clone `w7ccaparent` at candidate cdcc81cd5. The goldfish stopped after the suites were
green, so the Elephant ran the revert proof, wrote the patch and wrote these notes. Nothing is applied.
The newer HEAD 1d65c5893 only adds a held-patch evidence file. No production byte differs, so the apply-check stands.

Backlog item: `backlog/items/2026-10-30-push-review-of-a-feature-with-course-history-ends-in-cca-parent.md`.

## Behaviour

### CCA-PARENT detail and repair

A preflight refused CCA-PARENT used to give route `none` and no detail. It now returns `detail` with these fields:
- `lastRegisteredRound`
- `lastRegisteredCandidate`
- `expectedBase`
- `givenBase`

It also returns the repair route `delta-from-last-registered-round`, which has four steps:
1. Run `inspect-course-takeover`. If it reports no unregistered round, skip step 2.
2. Run `supersede-course-takeover`. This retires the passed but unregistered round above the registered lineage.
3. Run `register-feature-package.mjs --add-delta-request` and commit its output. That commit is the registration commit.
4. Run the preflight with `--base <last registered candidate>`, `--registration-commit`, `--delta-request` and
   `--correction-input-bindings`.

### One base derivation

`deriveRegisteredCourseBases` in `lib/critic-course-admission.mjs` derives the base. It uses the retained-lineage
reader that runtime admission also uses.

The preflight's detail and push-init's `critic-bound-verify` remedy (`criticBoundVerifyRemedy` in
`scripts/push-prepare.mjs`) both call it. They can no longer name different bases.

### Clearer refusals

- CDP-INPUT names the missing flag.
- CDP-EVIDENCE-SCHEMA names the admitted schemas. It says security evidence is not admitted here.
- CDP-EVIDENCE-MODE says a Verify evidence of mode critic is required, and gives the command that produces it.
- The text goes into `details.reason` because the CLI prints only `details`.

### Takeover help

`session-critic-finalizer.mjs inspect-course-takeover --help` and `supersede-course-takeover --help` print:
- the request file shape,
- its keys,
- one example.

## Reproduction (Glossover shape)

Fixture `parentLineageFixture`:
- two registered rounds,
- a passed round 3 that is not registered,
- later correction commits,
- a preflight with `--base <genesis>`.

CDPF067 reproduces CCA-PARENT. It then follows the four named steps exactly as printed. It parses step 4 through
`parseCriticDispatchPreflightArgs` and reaches `packet-ready`, with `base.commit` = the round-2 candidate and course
round 3.

The other new cases:
- CDPF068: push-init names the same base, and says the Verify evidence is of mode critic.
- CDPF069: the three refusal texts.
- CDPF070: the `--help` output of both takeover verbs.

## Evidence (scratch/agent-out/w7ccaparent logs)

- RED before the production edit (red1): CDPF067 to CDPF070 fail. Every existing case passes.
- Clone after the edit (c2):

  | Suite | Result |
  |---|---|
  | critic-dispatch-preflight | 70/70 |
  | critic-course-admission | 73/73 |
  | session-critic-finalizer | 91/91 |
  | push-prepare | 88/88 |

- Baseline (base1):

  | Suite | Result |
  |---|---|
  | critic-dispatch-preflight | 66/66 |
  | critic-course-admission | 73/73 |
  | session-critic-finalizer | 91/91 |
  | push-prepare | 88/88 |

  Neither side has a failing name. The difference of four is the new cases.
- Revert proof: the production files were reverted to the candidate, and all four new cases fail. The files were
  restored byte-equal.
- Patch apply-check on the plain candidate: exit 0. The patch has 5 files, +264/-8.

## Deliberately not changed

- No admission, budget or PASS rule was loosened.
- `critic-preflight-observer.mjs` is untouched.
- The tests of `critic-course-admission`, `push-prepare` and `session-critic-finalizer` are unchanged. The new cases
  live in the preflight test file.

## Open and not verified

- The typed correction-commit budget stop from the backlog item is not built. Under D190 a diff round is not refused
  by count, and the Glossover-shape fixture reaches admission. A budget stop has no reproduction yet.
- `criticBoundVerifyRemedy` is tested through the exported helper, not through a full `pushPrepareReport` run.
- The fixture reviews the last correction commit, with a diagnostic-registration commit on top. It does not review
  `HEAD`.
- Not verified: a live Glossover retest after install, Codex/Antigravity live, Windows, Full Verify, Critic, and PO
  acceptance.
