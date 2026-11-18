# w311 — the Critic preparation names the one commit step, and its argument refusals name the usage line (candidate 31, C31-C1)

Items L14 and R4 B3 of the [31 plan](../../plans/candidate-31-plan-2026-11-18.md) (recon notes: `w313` section L14, `w314` item B3). Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

**Order.** The patch is a delta on the base clone of candidate 31 (the chain after the delivered held patches up to `1e74e83ca`). It does NOT apply to the real checkout until that base clone is applied first; the check test therefore asserts only that the patch exists and touches the write list.

## What it changes

- **L14, `prepare-dispatch.mjs critic --label ...`.** The `commit-required` result now carries a `commit` object with ONE runnable step, derived and never run:
  - the preparation asks the read-only `commit-pipeline-owned.mjs --root <root> --agent --dry-run`. Only when that dry-run's `owned` plus `carried` is exactly `commitPaths` is the route offered: `commit.route = "owned-commit"`, `commit.executable` + `commit.argv` (the same command without `--dry-run`), and `next` prints it;
  - for every other answer (a refusal such as `CPO-FOREIGN-CHANGES`, a dry-run that covers other or fewer paths, `nothing-to-commit`, unparsable output) the route is `commit.route = "explicit-steps"`: `commit.steps` from the shared `writerCommitSteps` (`git add -- <exactly commitPaths>`, the message file with the two trailers, `git commit -F ... -- <same paths>`), and `commit.ownedRoute` names why the owned route was not offered;
  - `next` says that the identical command (`rerun`) follows. The preparation never stages or commits (tests assert no `git add`/`git commit` step runs). The condition that raises `commit-required` is unchanged.
- **The INFERRED part, measured.** The recon inferred that the owned route carries a diagnostic JSON plus its log. A real-Git case in `commit-pipeline-owned.test.mjs` (manifest listing both as `candidate-evidence`, both untracked) shows the dry-run naming manifest, JSON and log without staging or committing, and the real run committing exactly those three paths. `commit-pipeline-owned.mjs` itself needed no change.
- **B3.** Every argument refusal of `prepare-dispatch.mjs` (`--package`, `--spec/--base/--candidate`, label pairing, label syntax, the critic-fill default, and the parser errors of `runPrepareDispatch`) now repairs with `usage: <the failed verb's usage line(s)> ; every verb and flag: node <plugin-root>/scripts/prepare-dispatch.mjs --help` (under 600 bytes; was the whole 3,871-byte help). An unknown verb names the help command only. The help text itself is unchanged.

## Tests (test first)

Written and run RED before the production edit (5 red: three L14 cases, two B3 cases), then GREEN:

- `prepare-dispatch.test.mjs`: 43 of 43 pass (5 new: owned route named, explicit steps for refusal/other paths/no answer, second round of the same evidence, repair size and usage line for eight refusal shapes, unknown verb).
- `commit-pipeline-owned.test.mjs`: 16 of 16 pass (1 new, the measurement above).
- Restated (QG-04), not weakened: three existing `prepare-dispatch.test.mjs` cases that reach `commit-required` stubbed every step by name and refused an unlisted one, so they gained the answer for the new read-only dry-run step: "the first Critic call produces and registers evidence, stops once with the exact paths and commits nothing", "a registered evidence that is still uncommitted is registered again ...", and "C30F-G4B --successor-of passes through ..."; the second also lists the dry-run step in its expected step order. All their original assertions remain.
- Failure classes covered: the repair-size defect at all five repair sites plus the parser errors; the commit-step defect for the owned route, a refused owned route, a route covering other paths, an empty route and no output.

## Not changed / not proven

- No change to when `commit-required` is raised, to any admission or evidence rule, to the commit guard, any signature or approval; no stored status, no record or digest change. The `<plugin-root>` placeholder in the help command is the existing convention of the usage lines.
- The two calls remain (commit, then the identical rerun): the commit is inherent and the preparation never commits.
- Not proven: a live consumer round; whether the commit guard admits the printed explicit steps for a protected path (that stays the guard's decision; the `ownedRoute` reason is shown).
- The Critic is suspended by the PO for candidates of this repository and no Full Verify ran: verified by tests only.
