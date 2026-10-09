# Critic report: T90 delta over T2, F2, T3, F3 (Opus, class G), 2026-10-09

Persisted by the Elephant from the Critic's returned report (the Critic has no Write tool). The findings, the
not-flagged rubric, the trajectory table and the not-reached list are kept in substance; the disclosures are shortened.

- Requested route: claude-opus-5-5 at max. Effective identity: claude-opus-5-5, from the dispatch's own runtime prompt.
  Route pre-check passed. Lane: functional-equivalent-read-only; OS isolation not asserted.
- Review object (`git show` per SHA): `02ba09ad1`, `eca42af19`, `a7fb4f76d`, `b6c0b087d`. Ruleset matches all four
  stripped records.
- Status: PARTIAL (budget checkpoint at 20 of 25). Pass/fail withheld.

## Findings

### F-1 (minor): validation and rendering iterate `recovery.files` separately

`humanGuardAuditLockRecoveryLine` validates the entries in one pass and renders from a second, independent pass
(`[...new Set(files)]`). The 8-entry cap is checked against `files.length`. An object that passes `Array.isArray` but
has its own iterator, or a Proxy over an array, can yield valid entries to the validator and other text to the
renderer. No current producer builds such an object; this is defence in depth, not a live path. Fix shape: copy once
(`Array.from(files)`), then validate and render from the copy.
Evidence: `plugins/pipeline-core/lib/human-guard-override.mjs` at `b6c0b087d`, lines 3141–3146 (introduced in
`eca42af19`). Spec-ref: `specs/sprint-alfred-epic/plans/0.7-execution-order.md` lines 1491–1495.

### F-2 (minor): stale description and assumption text in the T90-T test header

`a7fb4f76d` changed (f) to assert the exact main-checkout-relative POSIX path and added (g) (no `recovery` when the
common dir is not `.git`). The header still says "(f) every AMBIGUOUS refusal carries error.recovery", and Assumption 1
still describes `files` as the absolute lock path. Evidence: `plugins/pipeline-core/lib/human-guard-override.test.mjs`
`:6110`, `:6120-6122`. Spec-ref: prior finding F3 (plan line 1487); plan lines 1839–1846.

## Deliberately not flagged

- The cure design (plan 1488–1499): one fixed line, one shared helper reused by the CLI; closed anchored regex
  re-validation, fail-closed to today's two lines; `recovery.command` never echoed; attended precondition wording and
  the win32 liveness caution present; `recovery` keys exactly `{files, command}`.
- The recovery-path ruling (plan 1837–1846): emitted only for a `.git` common dir, derived from the lock path, main
  checkout root wording, absent for a separate git dir, `repo.git` and `.git/modules/sub`.
- Prior F1–F3: the renderer and the CLI read `error.recovery`; the three hook consumers pass the raw error
  (`lib/guard/denial-route.mjs:217-218`, `hooks/guard-testpath.mjs:376-377`, `hooks/guard-gate-strength.mjs:749-750`);
  the rendered line is no longer a bare delete; (a)–(d2) re-pinned through the host seam on every host.
- Scope (each record's `changedFiles` equals its commit's file list), test integrity ((f) is stricter), edge cases,
  security (charset, `--`, no absolute host path), no new dependency, QG-06, ADR-0011, authorship trailers.

## Trajectory check: consistent

T2 RED WSL exit 1 (4 briefed pins); F2 WSL 195/194/0/1; T3 RED on (w), (f), (g), (h), (j); F3 WSL 199/198/0/1, native
T90 24/23/0/1; consumers green before and after. Native non-T90 status at `b6c0b087d` is not evidenced (runs are
T90-filtered); no commit claims it.

## Briefing violations

None.

## Not reached (as returned)

1. Category 3, last link: the `HumanGuardOverrideError` with its `recovery` property reaching the consumers unchanged
   when the audit lock is ambiguous during planning (`planHumanGuardOverride` → `acquireAuditLock`; the CLI `plan`
   catch).
2. Full read of `guardrails/security.md`, `quality-gates.md`, `git.md`.
3. `templates/prompts/agent-obligations.md` §6.
4. An execution repro of F-1.
5. T90 row clauses outside the four commits (win32 owner liveness, TP-5 restore/unstage admission): not cleared.

## Live guard misfire observed by the Critic

`guard-push.mjs` refused three read-only `git grep` calls (`-C3`, `-B 8 -A 1`, a pattern with `(`, `.*`, `^`) with
"push target is not unambiguous". Recorded as toil T112.
