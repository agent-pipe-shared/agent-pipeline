# WIN-GES-D3: is hardening idempotent on win32? (diagnosis, 2026-10-09)

Slice `WIN-GES-D3-20261009` · diagnosis only, no production or test edit · native win32, Node v24, no WSL run.
Disposition: **independent review: pending** (dispatcher decides); this note is evidence, not acceptance.

## 1. Verdict

**Product defect, not a fixture fault.** `hardenWindowsPrivateDirectory` succeeds on the first call against a directory
and fails on every later call against the same directory. Its child PowerShell exits 1 at `Set-Acl` with
`PrivilegeNotHeldException` (`SeSecurityPrivilege`), and the module collapses that into `unavailable`.
`putRestrictedGovernanceEvent` passes `create: true` on every put, so on a real win32 host the first put into a
restricted root succeeds only when the root had not been hardened yet; any put into an already-hardened root is refused
with `GES-RESTRICTED-WINDOWS-ASSURANCE`. The remaining native red near `governance-event-store.test.mjs:1138` is that
defect, reached through a correct fixture.

Primary module: `plugins/pipeline-core/lib/windows-private-state.mjs` (the hardener is not idempotent).
Contributing module: `plugins/pipeline-core/lib/governance-event-store.mjs` (`assertRestrictedRoot` hardens an existing
root, contradicting its own docblock at `:207-217`).

## 2. Method

Probe `scratch/dispatch/win-ges-d3-a1/probe.mjs` (copy kept at `evidence/WIN-GES-D3-20261009/probe.mjs`), run with
`node plugins/pipeline-core/scripts/capture-evidence.mjs --out evidence/WIN-GES-D3-20261009/probe.txt --label native -- node scratch/dispatch/win-ges-d3-a1/probe.mjs`,
exit code 0 (the probe reports findings, it does not assert). The production functions are called unmodified; the only
instrumentation is the public `options.run` seam of `hardenWindowsPrivateDirectory` / `assessWindowsPrivatePath`,
which receives a wrapper around the real `spawnSync` that logs exit status, signal, error code, duration and a scrubbed
stdout/stderr excerpt. Experiment D runs the store route with the default `io` (no wrapper anywhere in the path).
The capture header records `head e51844ab8` with a dirty tree; the files read for this analysis are the working-tree
files the probe ran against. I did not diff them against the briefing's candidate commit `4ef3071a6`.

Calls (each on a fresh `mkdtemp` directory unless noted), result code = returned `status` / child exit status:

| Call | Result | Child exit(s) | Spawns |
|---|---|---|---|
| A.harden#1 `hardenWindowsPrivateDirectory(dirA)` | `secure` | harden 0, observe 0 | 2 |
| A.harden#2 same directory | `unavailable` ("native Windows DACL observation failed") | harden **1** | 1 |
| A.harden#3 same directory | `unavailable` (same) | harden **1** | 1 |
| A.assess `assessWindowsPrivatePath(dirA)` | `secure` (owner = current principal, one ACE, no reparse point) | observe 0 | 1 |
| C.harden#1 fresh dir | `secure` | 0, 0 | 2 |
| C.harden#2 same dir, `records/x.json` child present | `unavailable` | harden **1** | 1 |
| C.assess | `secure` | 0 | 1 |
| B1 `assertRestrictedRoot(repo, root, {create:true})` (the test fixture, `:1145`) | returned root | 0, 0 | 2 |
| B2 `assertRestrictedRoot(repo, root, {})` (plan route, `:1162`) | returned root (`secure`) | observe 0 | 1 |
| B3 `assertRestrictedRoot(repo, root, {create:true})` (first put, `:1165`) | **threw `GES-RESTRICTED-WINDOWS-ASSURANCE`** ("assurance is unavailable") | harden **1** | 1 |
| B4 same again (second put) | threw, same code | harden **1** | 1 |
| D1 `assertRestrictedRoot(.., {create:true})` default io, fresh root | returned root | not instrumented | n/a |
| D2 `{}` default io | returned root | not instrumented | n/a |
| D3 `{create:true}` default io | **threw, same code** | not instrumented | n/a |
| D4 `{create:true}` default io | **threw, same code** | not instrumented | n/a |

Every instrumented spawn carried `windowsHide: true`. Per hardener call there are at most 2 child processes, per
assessor call 1; the probe made 19 spawns in total (14 instrumented + 5 in D). I cannot observe the screen from a
dispatch, so "no console window appeared" is not verified visually; the source-level `windowsHide` is. The stop
condition (more than a handful of windows per call) does not apply by count.

Failing child, identical in A.harden#2/#3, C.harden#2, B3 and B4 (host locale is German; the privilege name and exit
status do not depend on the locale):
`Set-Acl : <process lacks the "SeSecurityPrivilege" privilege required for this operation>`,
`CategoryInfo: PermissionDenied ... [Set-Acl], PrivilegeNotHeldException`,
`FullyQualifiedErrorId: System.Security.AccessControl.PrivilegeNotHeldException,Microsoft.PowerShell.Commands.SetAclCommand`.

## 3. Where the second call diverges (`file:line`)

1. `plugins/pipeline-core/lib/windows-private-state.mjs:77` (`HARDEN_DIRECTORY_SCRIPT`, the `Set-Acl -LiteralPath $p
   -AclObject $a` statement, script built at `:68-78`) is the statement that fails. The same script, with the same
   statements, succeeds on a directory that has never been hardened (first call: owner = current principal, inherited
   DACL) and fails on a directory it already hardened (protected DACL, single ACE for the current principal).
2. `windows-private-state.mjs:129` converts the non-zero child exit into
   `unavailable("native Windows DACL observation failed")`; `successful-spawn.mjs:9-22` admits only status 0.
   `:230-232` (`hardenWindowsPrivateDirectory`) returns that value as-is, so the stderr cause is lost at the module
   boundary.
3. `plugins/pipeline-core/lib/governance-event-store.mjs:231` (`const state = create ? harden(target) : assess(target);`)
   decides between hardening and assessing only from the caller's `create` flag, not from whether `mkdir` (`:220`)
   created anything. `putRestrictedGovernanceEvent` (`:1716`) always passes `create: true`, so every put re-hardens.
   `:232` then discards `state.reason` (message carries only `state.status`), which is why the test output said only
   "unavailable".

Test side (no fault found): the fixture at `governance-event-store.test.mjs:1145` creates the root through
`assertRestrictedRoot(.., {create:true})` (first harden, passes; probe B1). The plan call at `:1162` assesses and
passes (B2). The first `putRestrictedGovernanceEvent` at `:1165` is the second harden (B3) and fails; this is exactly
the stack in `evidence/WIN-GES-T3-20261009/native.txt:82-90`. The same sequence fails from a plain temp root with no
test state at all (B3, D3), with and without the spawn wrapper.

## 4. Classification

- **Product defect, `windows-private-state.mjs`** (non-idempotent hardener): reproduced in isolation, three of three
  repeat calls fail, independent of the store and of children present.
- **Product contract drift, `governance-event-store.mjs:231`**: the docblock (`:207-217`) says a pre-existing root is
  only assessed and never hardened, "so a raced-in or attacker-controlled directory is never silently claimed as
  ours"; the code hardens any root a caller passes with `create: true`. This is what routes every put into the
  defective hardener.
- **Not a fixture fault.** T3's fixture change is correct and stays.

What is proven and what is not: the failing statement, the exit status, the privilege name and the 100 % repeatability
on this host are measured. **The mechanism is not proven**: why the identical `Set-Acl` needs `SeSecurityPrivilege`
only once the DACL is already protected (a hypothesis: the cmdlet then persists a section beyond Access/Owner) was not
probed, and I did not test whether an elevated token passes. The defect is still real for an ordinary user token,
which is the normal product case.

## 5. Proposed test-first slice pair (one module each)

**Slice 1: `WIN-HARDEN-IDEM` in `plugins/pipeline-core/lib/windows-private-state.mjs`** (root cause; land first).
- Pin (test file `windows-private-state.test.mjs`, which today calls the hardener once on a fresh target, at `:107`,
  so the repeat path is unpinned): *"hardenWindowsPrivateDirectory is idempotent: on one fresh temp directory, three
  consecutive calls each return status 'secure', and a following assessWindowsPrivatePath returns 'secure'."* Run
  natively on win32; typed skip on any other platform (the module resolves a fixed `powershell.exe` with no seam, so
  there is no platform-independent form without adding a seam, which is a production change of its own). Red today
  at call 2 (probe A.harden#2). Control: call 1 is green today.
- Fix shape: in `hardenWindowsPrivateDirectory` (`:230-234`) assess first; when the assessment is already `secure`,
  return it without running `HARDEN_DIRECTORY_SCRIPT`; otherwise run the script and re-assess exactly as now. The
  postcondition ("assess says secure") is unchanged and no write happens when it already holds. Alternative, untested:
  persist only the Access and Owner sections through the .NET API the batch observer already uses (`:94-96`), which
  needs its own mechanism probe first.
- Caveat for whoever reviews it: the observer returns principals and owner, not the DACL "protected" bit, so a
  directory that is secure only by inheritance would be skipped rather than made protected. If protection must be
  guaranteed, the observation has to carry it first.
- Cross-callers: `worktree-lifecycle.mjs` calls the same hardener at `:1395` (and takes it as a default parameter at
  `:352`) for pre-existing directories, per the hardener docblock (`:224-229`). I did not read that context, so whether it can
  reach an already-hardened directory is unverified; the slice's review should check it.

**Slice 2: `GES-ROOT-CREATED` in `plugins/pipeline-core/lib/governance-event-store.mjs`** (restores the documented
contract; optional for turning `:1138` green, design-level).
- Pin (platform-independent, through the existing `io` seam with simulated win32, next to the cases at `:1242` and
  `:1258`): *"assertRestrictedRoot on an already-existing root with create: true consults assess and never harden."*
  Red today on every host (`:231`). Its control is the existing `:1242` case (a root the call creates is hardened).
- Fix shape: use the return value of `mkdir(target, { recursive: true, mode: 0o700 })` (the first path created, or
  `undefined`) as `created`, and select `created ? harden(target) : assess(target)`. Design consequence to decide: a
  pre-existing, unhardened root passed with `create: true` is then refused as `insecure` instead of being fixed.
  Also consider including `state.reason` in the `:232` message.
- Ordering: `WIN-GES-F4` and `WIN-AP-S3` edit the same file (`:155`, `:901`); schedule this slice on the same
  serialised lane (Ruling 143 order).

Expected effect: Slice 1 alone turns the `:1138` case's put steps green on this host class; Slice 2 alone would also,
by never re-hardening, but would leave the defective hardener for its other callers. The `:1138` body after `:1165`
(inspect, replay, conflict, erasure) has never run natively, so a further red behind it is possible.

## 6. Not done, by scope

No WSL run (win32-only question). No production or test edit. The platform/runner matrix: the defect lives in the
win32-only branch (`windows-private-state.mjs`, `governance-event-store.mjs:228-233`), so POSIX and WSL behaviour is
unchanged by both slices; only the native Claude-on-Windows path was measured. An elevated-token host, a non-German
locale and a Codex/Antigravity runner on Windows were not exercised.

Evidence (untracked by repository convention): `evidence/WIN-GES-D3-20261009/probe.txt`,
`evidence/WIN-GES-D3-20261009/probe.mjs`; prior art `evidence/WIN-GES-T3-20261009/native.txt`.
