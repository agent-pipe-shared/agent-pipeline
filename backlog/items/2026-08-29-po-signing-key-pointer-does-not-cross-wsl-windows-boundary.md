---
schema: pipeline.backlog-item.v1
id: pipeline.po-signing-key-pointer-does-not-cross-wsl-windows-boundary
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 09696633932428f93c5a9c097a715730f01f994a
closure_evidence: backlog/items/2026-08-29-po-signing-key-pointer-does-not-cross-wsl-windows-boundary.md
sprint: nova
done_when: manual
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §3.2) and the PO's own observation, cited by scratch/greenfield-triage-2026-08-29.md finding F15, observed during the 2026-08-29 three-runner greenfield test."
---

# The machine-plane PO signing-key pointer is keyed per-OS-environment, not per-physical-machine

## What happened

A PO signing-key pointer was registered earlier in a WSL session on a given
physical machine. Later the same day, a Claude session running on the
Windows side of the *same physical machine* reported "this machine has no PO
signing key recorded at all." The physical key itself is shared across both
environments via the Windows/WSL filesystem bridge, but the pointer/plane
that tells a session where to look for it appears to be keyed per operating-
system environment (WSL vs. Windows), not per physical machine as the
guidance implies. Separately, the Codex runner needed a manual trust-anchor
overwrite in both of its sessions the same day.

## Where it is

Searched this repository's `plugins/pipeline-core/scripts/` and
`plugins/pipeline-core/lib/` for the pointer-registration mechanism
(`human-authority-grant.mjs`, `guard-human-override.mjs`,
`critical-human-proof-policy.mjs`) and found the consumption side —
`human-authority-grant.mjs` line ~271 throws `HAG-TRUST-ANCHOR-MISSING` when
`project/critical-human-proof.json` carries no `trustAnchor` — but **could
not locate, in this repository's own source, the specific registration path
that decides which OS-scoped location a session reads the key pointer from**,
nor confirmed the WSL-vs-Windows keying claim directly in code. This finding
rests on the runners' own reports plus the PO's own direct observation
across two sessions on the same physical machine, not a controlled
reproduction performed in this dispatch.

Per the briefing's sanitization constraint, this item deliberately does not
name the key's directory, its OS-scoped storage plane, or any anchor value —
only the PLANE/boundary distinction the runners observed.

## Location (found 2026-08-29, dispatch NVA-R23-KEYPOINTER)

The registration/lookup mechanism the prior investigation could not find:

- `machinePlaneFilePath()` (`plugins/pipeline-core/lib/machine-plane.mjs`,
  ~L48) is the SOLE derivation of the plane's one file: `join(realpathSync(
  homedirFn()), ".agent-pipeline", "machine.json")`. `homedirFn` defaults to
  Node's `os.homedir()` and is derived from nothing else — never
  `process.env`, never repository config, never tool input.
- `readMachinePlane()` (same file, ~L137) reads that file and returns the
  `poKeyDirectory` field — the pointer itself.
- Consumption side: `observeLocalTrustAnchorPointer()`
  (`plugins/pipeline-core/lib/project-onboarding-v3.mjs`, ~L5360) calls
  `readMachinePlane()` and returns `status: "no-plane"` / `"no-directory"`
  when nothing resolves. That status feeds the literal "this machine has no
  PO signing key recorded at all" guidance text
  (`proposeTrustAnchorAbsentGuidanceAction()`, same file, ~L5522).
- A second, independent tier sits ahead of the machine plane in
  `po-human-approval.mjs`'s CLI (`parseHumanArgs()`, ~L504-553): an explicit
  `--directory` flag, then a repo-scoped store keyed by `gitCommonDir`
  (`resolveRepoScopedDirectory` ~L219, `readRepoKeyDirectory` ~L189), THEN
  the machine plane, THEN the `PIPELINE_PO_APPROVAL_DIRECTORY` env-var
  fallback. The repo-scoped tier is keyed to the exact checkout's
  git-common-dir, not the machine plane — it crosses the WSL/Windows
  boundary only when both environments happen to resolve the SAME
  underlying `.git` (e.g. a shared bind mount), which is not the general
  case.

**Per-OS-environment vs. per-physical-machine, confirmed directly in code:**
`machinePlaneFilePath()` is keyed exclusively by `os.homedir()`. This is a
per-OS-environment resolution, not a per-physical-machine one: on one
physical machine running both a WSL shell and a native Windows shell,
`os.homedir()` returns two genuinely disjoint filesystem roots that are not
bridged anywhere in this code path. No physical-machine identifier
(hostname, hardware ID, or similar) is consulted anywhere in
`machine-plane.mjs`. This exactly reproduces the observed symptom: a pointer
registered from one shell is invisible from the other on the same box, even
though the underlying key material may itself be reachable from both
environments once a session knows where to look.

**Design-intent read (technical judgment, not a product decision):** the
surrounding code and spec (`specs/sprint-nova-epic/plans/
nova-setup-bootstrap.md` §6a, decided 2026-08-08) both frame this plane as
per-physical-machine — the module is named/documented as "the machine-scoped
configuration plane", and the spec text describes it as "one named
configuration file on the operator's machine" (singular). Neither the spec
nor `machine-plane.test.mjs` mentions a WSL/native-Windows dual-environment
scenario anywhere. This reads as an unconsidered gap between the stated
per-machine intent and the actual per-`os.homedir()` mechanism, not a
deliberate per-environment design choice recorded anywhere. On that basis,
**Acceptance direction 1** (single registration works across both
environments on one physical machine) is more consistent with the code's own
apparent intent than direction 2. Building it needs a genuine
physical-machine-identity or cross-boundary resolution mechanism — out of
scope for the investigating dispatch (NVA-R23-KEYPOINTER field 4 forbade a
"physical-machine-identity resolver") and a nontrivial platform-detection
problem in its own right (no platform-portable physical-machine identity
primitive exists in Node's standard library; correctly resolving "this WSL
shell's corresponding Windows home" is a new mechanism, not a one-line
change).

**No fix built in this dispatch:** the literal "no PO signing key recorded
at all" message that would carry the direction-2 interim wording
(Acceptance's OR clause) lives in `project-onboarding-v3.mjs`
(`proposeTrustAnchorAbsentGuidanceAction()`, ~L5522) — a file
NVA-R23-KEYPOINTER's briefing explicitly forbade editing (another dispatch
may be actively editing it concurrently). No implementation was attempted.

## Recommended next step

Once `project-onboarding-v3.mjs` is free of concurrent edits, a follow-up
dispatch should add one sentence to
`proposeTrustAnchorAbsentGuidanceAction()`'s guidance text naming that the
machine plane is scoped to the CURRENT process's home directory (so a WSL
shell and a native-Windows shell on the same box never share one) plus the
exact registration command for the current environment. This satisfies
Acceptance's OR clause as a low-risk interim step, independent of and prior
to any larger decision about building the per-physical-machine resolution
recommended above as the better long-term fit for the code's stated intent.

## Proposal

Because the concrete registration/lookup mechanism was not located during
this investigation, a future session should first do the location work this
dispatch could not (find the actual code path that resolves the trust-anchor
pointer per session, likely something env-var- or well-known-path-based,
scoped separately for a WSL shell vs. a native Windows shell on the same
physical machine) before proposing a fix shape. Once located, the fix
direction implied by the observed symptom is: resolve the key pointer by
PHYSICAL MACHINE identity (or explicitly document that it is intentionally
per-OS-environment and instruct operators to register it twice, once per
environment, if that is accepted as correct behavior) — the current silent
mismatch, where one environment simply reports "no key" with no hint that a
sibling environment on the same box has one, is the actual defect regardless
of which resolution direction is chosen.

## Acceptance

- A future session locates the exact code path that resolves the PO
  signing-key trust-anchor pointer and records it in this item before
  closing.
- Given the same physical machine, registering the key pointer once is
  sufficient for both a WSL session and a native Windows session to find it
  — OR, if the PO decides per-environment registration is intentional, the
  "no key recorded" message explicitly says so and names the registration
  command for the current environment, rather than reading as an unqualified
  absence.
- `manual` is used here (per the briefing's grammar) because, absent the
  located mechanism, no mechanical predicate can yet be written honestly;
  once the mechanism is located, this item's `done_when` should be updated
  to a `contains`/`script-exit-zero` predicate naming the actual fix file.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Observed directly by the PO across two sessions on the same
  physical machine, and independently corroborated by Codex needing a manual
  trust-anchor overwrite in both of its own sessions the same day — two
  independent signals of the same class of friction around key-pointer
  scoping.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — a PO who
  cannot locate their own already-registered key on a machine they already
  configured is a hard block on any ceremony needing a signature.
- **Date:** 2026-08-29

## Fixed, 2026-08-29 (dispatch NVA-R30-KEYPOINTERGUIDE, commit `09696633`)

Acceptance's OR-clause (interim, low-risk step) landed:
`proposeTrustAnchorAbsentGuidanceAction()` in `lib/project-onboarding-v3.mjs`
now names that the machine plane is scoped to the CURRENT process's
`os.homedir()` (so a WSL shell and a native Windows shell on the same
physical machine never share one pointer) and appends "from THIS SAME
environment" to the registration-command instruction. Verified:
`project-onboarding-v3.test.mjs` 151/151 (no regression),
`check-consumer-safe-paths.test.mjs` 9/9. The larger direction (a genuine
per-physical-machine resolution mechanism) remains unbuilt — out of scope
for this interim fix, per the item's own Acceptance OR-clause. Left
`status: open`: no dedicated regression test asserts the new sentence's
text (disclosed by the dispatch as a judgment call, not an oversight), and
the "future session locates the exact code path" sub-criterion is now
satisfied by NVA-R23-KEYPOINTER's prior investigation + this fix, but the
item's own predicate is still `manual`.

## Closed, 2026-08-29 — accept interim fix, no further action this candidate

Reviewed as part of the Topic 8 defer-design/unclear sweep. The Acceptance
OR-clause is satisfied by the landed interim fix; closing rather than
carrying the missing regression test or the larger per-physical-machine
resolution mechanism forward as open work for this candidate. If a future
session revisits key-pointer scoping, that larger direction is new,
narrower-scoped work, not a reopening of this item.
