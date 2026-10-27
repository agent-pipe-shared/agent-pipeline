# Recon G18 (pipeline.greenfield.g18): aggregated dispatch readiness recovery and reviewer admission

Read-only recon, no patch, no test edited. Candidate 775c543ab. Tool budget was spent partly on guard refusals of
`-c`, `--glob` and `-l` multi-path rg spellings; the recon is therefore shallower than briefed (see section 5).

## 1. Current behaviour (file:line)

Premise check: the plan file (`plans/plan_greenfield-followup-2026-10-24.md` line 28) carries only the G18 table row.
The finding ids `codex2.P0.1.dispatch-readiness`, `codex2.P0.2.checkout-verify`, `codex2.P0.2.branch-runtime` occur in
no file I could reach by `rg` in the plan or `plugins/pipeline-core`; the briefing's statement that the plan carries
them does not hold. Only the row text was available.

An AGGREGATED recovery output exists in exactly one place, and it is narrow:
- `plugins/pipeline-core/lib/windows-authority-readiness.mjs:50-123` `assessWindowsAuthorityReadiness` returns
  `{schema:'pipeline.windows-authority-readiness.v1', status:'ready'|'unavailable', causes:[{pathClass, reason, path,
  nextAction}]}`; it loops over several path classes plus private-state (lines 63-120) and collects every cause
  instead of stopping at the first. Each cause carries a `nextAction` (guidance text, line 41-43).
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:1736-1767, 1787-1789` surfaces it, but ONLY when
  `windowsAuthorityPlatform === "win32"` (line 1740); a throw or malformed shape folds to one
  `WIN-AUTH-OBSERVATION-UNAVAILABLE` cause (1741, 1753-1761). It covers authority-path readability only; it does not
  list host identity, reservation, dispatch, return, source binding, integration or reviewer admission.

Everything else is first-blocker-wins with one `nextAction`:
- Preflight status/nextAction (`pipeline-start-preflight.mjs:1593-1619, 1765-1852`): one status, one nextAction;
  `sessionReadiness` is just `{reasonCode, lifecycleStatus}` (1613-1616). Not an aggregate.
- Native Goldfish host (`lib/native-goldfish-host-state.mjs`): faults are single `nativeManagedFault(code)` throws;
  a repair string is attached for two cases only: `staleApprovalRepair` (1152-1156, CVCT-AUTHORITY-STALE/PROFILE-STALE)
  and `ownerFault` (1160-1167, foreign-session reservation, names `session-authority-repair.mjs inspect`).
  `RUNNERS = {claude, codex}` (line 44); no Windows-specific branch (rg `win32|platform` found nothing).
- Reviewer admission (Critic): `scripts/critic-dispatch-preflight.mjs:369-376` reads
  `readCriticCourseAdmission` and, if not `admitted`, uses `criticCourseRepair(code)`
  (`lib/critic-course-admission.mjs:38-46`), which has a repair for exactly three codes
  (CCA-DETERMINISTIC-UNAVAILABLE, CCA-REVIEW-UNIT-REQUIRED, CCA-MANIFEST-READ); every other code returns null
  (no recovery). One refusal reported at a time.
- Codex reviewer path: `scripts/codex-native-critic-preflight.mjs:217-227` returns `passed` with a smoke receipt or
  `unavailable` with one `code` and `detail`; no recovery action field. No Claude/Windows-specific reviewer
  admission path was found in `critic-dispatch-preflight.mjs` or `critic-course-admission.mjs` (rg `windows|win32`
  empty in the latter).

## 2. Gaps

1. No single readiness view listing every blocker of a dispatch (host identity, reservation, return, source binding,
   integration, reviewer admission) each with a recovery action. code-fixable-here.
2. Windows authority aggregate is win32-only and authority-path-only; not joined to dispatch/reviewer blockers.
   code-fixable-here (composition), the Windows host observation itself is native-host-only.
3. `criticCourseRepair` returns null for all but 3 codes; Codex native preflight `unavailable` has no recovery field.
   code-fixable-here.
4. Native host fault codes (`nativeManagedFault`) mostly lack `repair` text. code-fixable-here (a code-to-repair
   table), except the faults that need a live host.
5. Qualification of Codex and Claude/Windows end to end (real host identity, reservation, dispatch, return,
   integration). native-host-only.

## 3. Minimal slices (code-fixable-here)

Slice A, "aggregate dispatch readiness". Files: new `plugins/pipeline-core/lib/dispatch-readiness.mjs` + cases in
`native-goldfish-host-state.test.mjs` (existing registered file; the briefing allows it). A pure function
`assessDispatchReadiness({probes})` where each probe is an injected observer returning `{ok}` or
`{code, nextAction}`; returns `{schema, status, blockers:[{area, code, nextAction}]}` with all failing probes.
RED cases:
- `DR1 all failing probes are listed, not only the first` (two failing probes -> blockers.length === 2).
- `DR2 every blocker has a non-empty nextAction` (assert for each).
- `DR3 a throwing probe yields a typed blocker, not an exception`.
- `DR4 ready only when blockers is empty`.
Subject: `feat(readiness): aggregate every dispatch blocker with its recovery action`.

Slice B, "reviewer admission recovery". Files: `lib/critic-course-admission.mjs` (REPAIRS table),
`scripts/codex-native-critic-preflight.mjs`. These are NOT in this dispatch's write scope; a future briefing must
name them. RED: `every CCA refusal code in the shipped code set maps to a repair or an explicit "no route"`;
`codex native preflight unavailable carries a nextAction`. Subject:
`feat(critic): name a recovery for every reviewer-admission refusal`.

## 4. To call the row technically delivered

Slices A and B green with synthetic controls, the aggregate wired into the preflight output (preflight file also
outside this scope), and the existing 76/76 and 4/4 controls still green. The row's "Qualify ... for Codex and
Claude/Windows" half stays native-host-only: it needs live Codex and Windows host runs, so the row cannot reach
delivered on code alone.

## 5. Confidence

Medium-low (about 60 percent) on the gap list. Not read: the original findings text (absent from the plan), the full
`nativeManagedFault` code set, `codex-critic-packet-host.mjs`, `model-role-host-identity`, `session-authority-repair.mjs`,
and whether a repair/aggregate exists in `pipeline-state.mjs`. Treat "no aggregate exists elsewhere" as unproven
beyond the files named.
