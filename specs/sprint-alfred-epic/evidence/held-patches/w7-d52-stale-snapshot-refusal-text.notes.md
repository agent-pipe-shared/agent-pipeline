# D52 slice E: a stale hook snapshot refusal names the refresh command and forbids bypassing

Slice W7-D52-STALE-SNAPSHOT-REFUSAL-TEXT-C1-20261027. Candidate 24fe84cdd. Held patch: `w7-d52-stale-snapshot-refusal-text.patch` (2 files, 27 insertions, 1 deletion). Nothing committed by the Goldfish; the host commits.

## Cause (re-verified against the clone, not taken from the recon)
`plugins/pipeline-core/lib/hook-currentness.mjs` line 89 rendered the refusal as `HOOK-SNAPSHOT-STALE: ... refresh it with: <SNAPSHOT_REFRESH_COMMAND>` and said nothing about bypassing. The refresh command is the one the code already derives (`refresh-mandatory-hooks.mjs --root <repo>`, or the installer's own `--install` without a root). The same renderer feeds both the commit-msg and the pre-commit hook. No other file in plugins/ or harness/ contains the text "refresh it with" (rg), so no second pin on the full string exists.

## Exact change
- `lib/hook-currentness.mjs` line 89: appended after the refresh command the single-literal suffix ` (bypassing this hook, e.g. git commit --no-verify, is forbidden: refresh it, never bypass it)`. The command itself is unchanged and stays one match for the existing `refreshCommands()` parser.
- Pin test file: two new cases inserted before the "consumer layout" case, existing cases untouched:
  1. `AC-179 (no bypass, D52): the rendered stale refusal of both hooks names the refresh command and states that bypassing the hook is forbidden` (rendered source of both hooks).
  2. `AC-179 (no bypass, D52, installed hooks): the printed stale refusal tells the committer not to bypass the hook` (real installed commit-msg and pre-commit hooks in fixture repos, stderr asserted).

## RED then GREEN (whole file, node --test, in the scratch clone)
- RED (new cases added, production unchanged): tests 44, pass 42, fail 2; the two failing names are exactly the two new cases.
- Baseline (clone2, unchanged candidate): tests 42, pass 42, fail 0.
- GREEN (patched clone, whole file): see the final line of this section, filled from the run log.
- Failing-name sets: baseline empty; RED = the two new cases only; no pre-existing failure.

GREEN (read by the Elephant from the Goldfish's own whole-file log in the patched clone): tests 44, pass 44, fail 0; the failing-name set equals the baseline (empty).

## Apply check
`git apply --check` of the patch in clone2 at the candidate: exit 0.

## NOT done
- Installers (`commit-msg-hook-install.mjs`, `pre-commit-hook-install.mjs`) not touched; the text is rendered by the shared renderer.
- Recon gap list for D52 (sections 5 and 6): H2 no Elephant binding for `docs/state.md`, pipeline files and intermediate feature states (po-decision); H3 stage-0 "about 25 lines" not machine-checked, only path count (po-decision); H4 handover size refusal remedy depends on rotation extraction acknowledgment (po-decision/process); H5 closed. The recon names no further code-fixable slice. Recon items NOT REACHED: Critic admission reader, signed push check, whether `Commit-Act:` is validated, the exact session refusal that led to `--no-verify`.
- No Critic review (parent-owned batch gate); no Full Verify.

## Proposed commit message
`fix(hooks): tell a stale-snapshot refusal not to be bypassed`

## Operator flow
Apply the diff (`git apply`), `git add -u -- plugins/pipeline-core/lib/hook-currentness.mjs plugins/pipeline-core/lib/pins/git-hook-runtime-snapshots-go-stale-after-plugin-changes.test.mjs`, commit with `--no-verify` (the installed hook may itself be stale), then stamp and install/refresh the hook snapshots.

## Protected-path classification observed
Neither file matches TP-1..TP-13 (agent-obligations section 2). `hook-currentness.mjs` is not among the `guard-gate-strength.mjs` table paths (rg of that file shows only the two lib entries `public-core-origin-allowlist.mjs` and `self-application-attestation-gate.mjs`).

## Review
An independent Critic review stays a parent-owned batch gate.
