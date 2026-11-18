# w313 — recon note for lanes L6 and L14 to L17 of candidate 31 (bundle addendum, Critic prepare two-step, Antigravity child model notice, hook git timeout, Antigravity cost row)

Order: apply AFTER the base clone of candidate 31 (`scratch/agent-out/c31/base`): the patch is the delta `35560870d72821ef9db6ce1dbbe9f296da0d1ca0..HEAD` of the clone slice C31-R3 and was checked against that base. It adds one new file, `specs/sprint-alfred-epic/plans/recon-l6-l14-l17-bundle-addendum-and-agy-friction-2026-11-18.md`; no code, test registry or document changes. The criterion binding AC-112 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- One recon note (141 lines), per item PROVEN / INFERRED / NOT MEASURED with file and line, what 30h to 30k already changed, the smallest build with its failing-first proof, the PO decisions with defaults, and a ranked build proposal.
- Findings in one line each:
  - L6: the typed, create-only follow-up already exists and the verifier accepts an evidence-only list without touching the first bundle; the gap is that the final Verify and the security verdict are written only by the push or release routes, so a local-only close never carries them. Smallest build: write that follow-up at `closed-local`. Binding by manifest digest is a record-shape change and is left as a PO decision.
  - L14: the two calls are inherent (the commit must precede the identical rerun), but the owned commit route `commit-pipeline-owned.mjs` already carries a manifest with its listed evidence (since 2026-11-11) and the preparation never names it; the build derives the commit step from that command's dry-run, else printed steps and `--stage`. The fit for a diagnostic JSON plus log is INFERRED, not run.
  - L15: the notice is a correct observation for the Goldfish roles (their routes are `flash`, never `inherit`) and has no repair text; text-only build; one report fact contradicts the dispatch guard and stays open.
  - L16: one fixed 5 s git helper without retry turns a transient timeout into an external-operator card; a per-call retry cannot bound the 10 s hook, so the safe shape is one `ETIMEDOUT` retry inside a per-planning deadline.
  - L17: the plan's `cost-summary` does not exist; no step writes `telemetry/costs.md`, and the `--row` reader is Claude-only by design.

## Checks

- `node --test specs/sprint-alfred-epic/evidence/held-patches/w313-recon-bundle-addendum-and-agy-friction.check.test.mjs` asserts that the patch exists, is non-empty and touches only the note. It was written first and was red (exit 1, no patch) before the note existed.
- The patch was saved with `save-patch.mjs` against the base clone: `apply --check on scratch/agent-out/c31/base: exit 0`. An `apply --check` against the real repository is expected to fail until the base clone is applied; the check test does not run it.

## Not changed / not proven

- Analysis only: no production code, no new test of the product, no producer run. No Critic round (suspended by the PO for candidates of this repository) and no Full Verify ran: this change is verified by the plain file test only.
- Not examined (named in the note): the `renderRow` internals and `--metering` of `usage-ledger.mjs`, which hook entry covers the override planning path and what the host does on a hook overrun, whether `audit-bundles/**` is a protected path, whether a dispatch record ever lands after the close (D3 is deferred), and the Antigravity child's rules text.
- Plan premise mismatch: L17 (plan row 47) names a `cost-summary` that does not exist in the code; the real subject is the Claude-only `--row` reader.
- The note builds nothing and changes no gate, signature, approval, record shape or digest byte; every build it proposes is staged, test first, and one decision (D1) is held for the PO.
