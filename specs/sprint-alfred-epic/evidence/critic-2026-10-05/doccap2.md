# Critic record — DOCCAP2 template cap wording (fix verification of template-cap-path F1, F2)

- Review object (enumerated): `573b5355b` (DOCCAP2; `templates/prompts/goldfish-task.md` and its vendored copy)
- Spec: `specs/sprint-alfred-epic/evidence/night-2026-10-05/budget-cap-source.md`; `guardrails/token-budget.md`,
  `guardrails/global.md`, `guardrails/quality-gates.md`; registry: template-cap-path F1, F2
- Route: requested `claude-sonnet-5-5`; effective `claude-sonnet-5-5` (observed in the dispatch's own runtime prompt);
  standard class
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: checkpoint at call 15 of 18 (4 of 16 counted calls were guard denials)
- **Verdict: pass/fail withheld — partial review** (not reached: `guardrails/global.md`, `guardrails/quality-gates.md`,
  full reads of `dispatch-budget-binding.mjs` and `guard-dispatch-budget.mjs`, other tests pinning the template text).
  **No finding survived the evidence gate** on the examined surface.

## Deliberately not flagged (summary)

Every new statement re-derived from code: clamp `min(stated, maxTurns - 15)` with 5 + 10 reserve
(`dispatch-budget-core.mjs:16-17, 49-60`); grant ceiling `maxTurns - 6` (`:118-124`); silent clamp (`tierLimited`
unused by the hook); `maxTurns` 50/50/80/40; threshold 28 of 35, confirmed live by the Critic's own notice at 15 of 18.
The added sentence "Treat the effective cap, not the stated number, as the base cap everywhere in this briefing" is the
one the spec prescribes. Both copies carry the same blob (byte-identical); word-diff shows only the intended clauses
changed; no stale wording left in templates or code; enforcement stays scoped to the Claude hook (TB-06); English.

## Trajectory — consistent

Logs: vendored check exit 0, vendored test 8/8, binding test 8/8, consumer-safe-paths 9/9; commands match the suites
relevant to a vendored-template edit. Limits: logs carry no tree identity; dispatch record not supplied.

## Candidate not taken through the gate

C9: the per-role implementor/mechanic default of 40 in `dispatch-policy.mjs` sits above the effective cap of 35 and is
clamped silently (`budget-cap-source.md:15, 31`); QG-06 not read, so neither cleared nor a finding. Pre-existing, outside
this commit. Also observed outside the object: the template labels the tool-budget bullet "TB-09", while
`guardrails/token-budget.md` numbers the tool-call budget rule TB-06.

## Briefing violations

None. The Critic could not persist `critic-notes.md`: its `node -e` write into its own scratch directory was refused by
`guard-lifecycle-ready` (`GUARD-DEVPLAN-SHELL`, lane `opaque-interpreter-code`); filed as backlog item
`2026-10-06-critic-scratch-notes-write-is-refused-again.md`.
