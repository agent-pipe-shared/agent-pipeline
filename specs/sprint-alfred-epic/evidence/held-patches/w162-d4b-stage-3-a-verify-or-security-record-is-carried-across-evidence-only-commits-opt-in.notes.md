# w162 — a Verify or Security record is carried across evidence-only commits (candidate 19, D4b/E3 order of work, step 3) — OPT-IN

Delta on w161, applied only in the opt-in block (`APPLY_AUTHORITY_CARRY=1`). Elephant-built, in a clone that carries the whole chain. **This patch widens what a push accepts.** It is the carry-forward branch of the "Proposed amendment of 2026-11-04" in `docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md` (point 2), which has had no independent review (the PO suspended Critic dispatches and decided on 2026-11-03 that applying or leaving out this block is the gate). Leave the block out and nothing changes.

## What it changes

- `lib/evidence-carry-forward-reader.mjs` (new): `evidenceCarriedForward({ root, record, kind, candidateCommit })` asks the w156 decision and never throws (an invalid commit, a missing repository or any error is a refusal). `gitleaksRangeSecretScan` is the secret scan a Security record needs (SEC-01): `gitleaks git <root> --log-opts <evidenceCommit>..<candidateCommit>` with the plugin's resolved config and `--exit-code 2`; exit 0 is clean, 2 a finding, everything else (no binary, no config, timeout, gitleaks' own error) is `unavailable`, which is a refusal. A Verify record needs no scan.
- `lib/evidence-carry-forward.mjs`: the scan context carries `evidenceCommit` next to `commit` (the range start); nothing else changes.
- `scripts/push-prepare.mjs` and `hooks/guard-push.mjs`: the `promoted` thunk of the w161 shared function has a second source after the release-promotion envelope: the carry-forward. push-prepare reports the third way as `promoted from <sha8> via evidence-only carry-forward`. Only the two known evidence records (Verify, Security) can be carried; a failed record (exit code not 0) and a record that does not satisfy the push boundary are refused exactly as before, because the shared function checks them independently of the commit.

## Why it is bounded

- The evidence set is the closed one of w156 (`specs/<f>/evidence/**`, `audit-bundles/**`, `lifecycle.json`, `result.md`, `project/push-threat-model.md`); anything else in the range (spec, plan, PRD, `project/guard-config.json`, any source, script or config) is a product path and refuses. The hash of the tree outside the set must also be equal at both commits.
- The record's commit must be an ancestor of the candidate.
- Security: a clean secret scan of the passed-over commits, fail closed.
- Root `/evidence/*` (where the Verify and Security records live) is gitignored in this repository, so the commits that matter are the registration, evidence and lifecycle commits under `specs/`.

## Checks

- Clone: `evidence-carry-forward` and `evidence-freshness-codes` 19/19 (new cases ECF9 to ECF11, EFC8; ECF11 ran with the real gitleaks: a clean range is carried, a token planted in an evidence file in the range is `SECRET-SCAN-FINDING`); `push-prepare`, `push-gate-satisfiability`, `guard-push-promotion`, `guard-push`, `guard-push-v2`, `guard-push-checkpoint-approval`, `guard-push-architecture` together 134/134; `installed-bootstrap-import-closure` and `pre-push-hook-install` 52/52. The architecture-boundary check prints the same 78 over-line-bound and 54 unowned-path as the unchanged main tree. `git apply --check` against the opt-in chain tree: exit 0.

## Not changed / not proven

- The managed git pre-push hook template still compares the exact commit and has no promotion either (today's behaviour for the envelope as well); a plain `git push` outside the Claude guard is therefore not helped by this. `lib/security-completeness-gate.mjs` compares a different record and is not touched.
- The record does not store `productTreeSha256`; the decision recomputes it from the git objects of the record's commit, which equals what a stored value would say as long as the record's `commit` field is trusted, the same trust the exact-commit check already places in it.
- Critic rounds are not carried (open question 2 of the ADR).
- No Full Verify; no independent Critic review (suspended by the PO); a real push through the guard with a carried record has not been run.
