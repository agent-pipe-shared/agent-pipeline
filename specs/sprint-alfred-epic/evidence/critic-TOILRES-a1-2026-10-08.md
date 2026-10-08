# Critic TOILRES-a1 (2026-10-08 late) — findings registry

Object: commit `a78507b41` (`specs/sprint-alfred-epic/design/toil-resolution-2026-10-08.md`). Route requested
`claude-opus-5-5` at max; effective identity observed `claude-opus-5-5` (runtime prompt). Lane functional-equivalent
read-only. Verdict: **FAIL** (2 major, 1 minor). Trajectory: consistent (sampled citations match). Persistence by the
Critic was unavailable (no write tool); the Elephant records the findings here verbatim in substance.

| ID | Severity | Gap | Evidence | Spec-ref |
|---|---|---|---|---|
| F1 | major | Scope stops at T76; T77 and T78 were already in the log at the reviewed commit (T77 explicitly assigns its structural fix to TOILRES: read grammar, child bootstrap receipt; refused shapes `rg -g`, `git … \| rg`, guard-dispatch refusal of a briefing given as a file pointer `DISPATCH-INCOMPLETE-BRIEFING`/`DBB-BASE-CAP-MISSING`). T78 (approval-chain pins not runnable on native Windows) affects the first-priority step TR-E, which names no WSL route. T79 (later) is also uncovered. | design L5, L130, L180; toil-log L82–83 | BI as amended; BJ |
| F2 | major | Invariant I1 ("no agent reads PO key material, machine plane or credential stores, even when the read grammar is relaxed") is enforced only by `isAllowedPassiveReadTarget`, which is passive-operand-only; the execution lane (R3, `node -e`) is unowned, unpinned, without expiry; the note leaves the `node -e` admission in ready state unverified (open item 5) and hands closing it to the PO. Combined with R1 (an unencrypted key imported via `--existing-key`; no `ENCRYPTED PRIVATE KEY` check in that branch), "no agent-made signature" is not shown. TR-H is only a non-gating readiness finding. | design L23, L140, L152–162, L190; `passive-read-policy.mjs:92-96`; `agent-obligations.md:40-41`; toil-log L66; `po-human-approval.mjs:1794-1802` (hits only L1338, L1348) | BI ("key material unreadable, no agent-made signature"); QG-06 |
| F3 | minor | "Owned" is applied to rows §22.0 does not assign (only T1–T20); T75 marked "R7-4 (owned)" although R7-4 / R7-4a admit only `backlog/`, `docs/`, `scratch/` — the `specs/` toil-log half of T75 has no slice. | design L27, L58, L127; spec.md:2006-2010, 2097-2101, 2280-2287, 2304-2308 | BI; §22.0 ownership rule |

Rows added to the toil log after the reviewed commit that the correction must also cover: T79, T80, T81.
