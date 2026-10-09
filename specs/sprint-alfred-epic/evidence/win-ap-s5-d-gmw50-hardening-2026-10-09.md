# WIN-AP-S5-D: why the hardened entry point fails native GMW50 (diagnosis)

Dispatch `WIN-AP-S5-D-20261009` (goldfish-deep, read + scratch probe). Candidate `e59ac57506428e517cfa15205a09b05ac59dd39c`.
Host: native Windows, Windows PowerShell 5.1, Node 24, non-elevated token. No product or test file was changed.
Independent review: pending.

## 1. Verdict

**Classification (B): a product defect in the hardener `hardenWindowsPrivateDirectory`
(`plugins/pipeline-core/lib/windows-private-state.mjs`, `HARDEN_DIRECTORY_SCRIPT`), not a fixture or host artefact.**
It is not caused by the WIN-AP-S5 edit and not by `ensureAgentPipelineRoot`.

1. GMW49 and GMW50 are **red natively at HEAD without the S5 edit**. The production call that GMW50 reaches,
   `guardMaintenanceWindowInternals.storagePaths(<fresh .git>)` on a fresh repository under `<repo-root>/scratch`, throws
   `GuardMaintenanceWindowError/GMW-DACL: window directory DACL is not owner-private` (probe 2, section 4.2). The S5 edit only
   moved the failure from `secureDirectory` on the leaf (`GMW-DACL`) to `ensureAgentPipelineRoot` on the `agent-pipeline`
   segment (`PB-WINDOWS-ASSURANCE`, UnauthorizedAccessException). GMW50 is documented as "GREEN today on every host"; that was
   true until commit `5a72c9b61`.
2. The regression is `5a72c9b61` (2026-10-09 06:24, WIN-HARDEN-F): it replaced `Get-Acl` + `Set-Acl` with
   `[System.IO.Directory]::GetAccessControl/SetAccessControl` over the `Access,Owner` sections and still calls
   `SetOwner(<current user>)` unconditionally. WIN-GMW-F's native capture (`evidence/WIN-GMW-F-20261009/native.txt`, written
   05:52) shows GMW49 and GMW50 PASS, so it predates the commit. WIN-AP-S5's `native-after.txt` (08:33) is the first native
   run after it. The pre-5a72c9b61 script run in probe 3 (section 4.3) hardens a directory on the checkout volume without error.
3. Why S6-F's pins (a)/(f)/(g) were green: they place their fixtures under `os.tmpdir()`
   (`lib/agent-pipeline-root-creation.test.mjs`, `withRepository`), the user profile, whose inherited DACL carries an explicit
   `FullControl` ACE for the user. GMW49/GMW50 place the repository under `<repo-root>/scratch`, a data-volume path whose
   inherited DACL does not (section 3).

## 2. Discriminating difference (measured)

| | TEMP placement (S6-F pins) | CHECKOUT placement (GMW49/GMW50) |
|---|---|---|
| Volume format | NTFS | NTFS |
| Owner of fresh directory | current user | current user |
| Inherited ACEs on `agent-pipeline` | CodexSandboxUsers Modify, machine-local SID Modify, SYSTEM FullControl, Administrators FullControl, **current user FullControl** | Administrators FullControl, SYSTEM FullControl, **Authenticated Users Modify** (+ inherit-only generic rights), Users ReadAndExecute |
| Token | non-elevated (Administrators group deny-only) | same |
| `Directory.SetAccessControl` with `SetOwner` (shipped) | OK | **UnauthorizedAccessException 0x80070005** |
| Same, without `SetOwner` (Access section only) | OK | OK |
| `SetOwner` alone (to the same owner) | OK | **UnauthorizedAccessException** |
| Explicit user FullControl added first, then shipped script | OK | OK |
| Prototype fix (skip `SetOwner` when owner SID is already the current SID) | OK, secure, repeatable | OK, secure, repeatable |
| Pre-5a72c9b61 script (`Get-Acl` + `Set-Acl`) | OK | OK |

## 3. Mechanism

The failing .NET call is `[System.IO.Directory]::SetAccessControl($p,$a)` (step marker `Directory.SetAccessControl`, probe 1
variant S): `ObjectSecurity.SetOwner` marks the Owner section modified even when the new owner equals the old one, so the
persist step requests the Owner section, and writing it needs `WRITE_OWNER` on the directory (or `SeTakeOwnershipPrivilege`).
An owner holds `READ_CONTROL` and `WRITE_DAC` implicitly, **not** `WRITE_OWNER`. `Modify` (the default `Authenticated Users`
grant on a data-volume root, inherited here) does not include `WRITE_OWNER`; `FullControl` does. The Administrators group
that grants FullControl is deny-only in a non-elevated token. So on the checkout volume the Access-section write (needs
`WRITE_DAC`, implicit) succeeds and the Owner-section write fails with access denied. The four discriminating variants
(owner-only fails, access-only passes, grant-FullControl-first passes, skip-`SetOwner`-when-self passes) all match this chain;
no effective-access query was run, so the chain is inferred from them and from Windows access-control semantics, not traced.
Why `Set-Acl` succeeds in the same state was not isolated.

## 4. Probe output (scratch probes; fixtures only, removed afterwards; host names, user and SIDs redacted)

Ordinary-token facts from probe 1: `elevatedAdmin=False`, `volumeFormat=NTFS` on both bases, `psVersion=5.1`. Localized
well-known account names (German host) are rendered by their English names.

### 4.1 Probe 1: GMW50's fixture placement, hardener called directly

```
##### BASE: TEMP (os.tmpdir())
variant E  ensureAgentPipelineRoot(<fresh .git>) => {"created":true,"repaired":false,"advisory":null,"detail":null}
variant H  ACL of agent-pipeline BEFORE: owner=<host>\<user>, accessRulesProtected=False, attributes=Directory
             ace <host>\CodexSandboxUsers Allow Modify, Synchronize  inherited=True  (ContainerInherit, ObjectInherit)
             ace S-1-5-21-<machine>-<rid>  Allow Modify, Synchronize  inherited=True
             ace NT AUTHORITY\SYSTEM       Allow FullControl          inherited=True
             ace BUILTIN\Administrators    Allow FullControl          inherited=True
             ace <host>\<user>             Allow FullControl          inherited=True
           hardenWindowsPrivateDirectory(dir) => {"status":"secure","reason":"Windows owner, DACL, and reparse-point checks are private"}
           ACL AFTER: owner=<host>\<user>, accessRulesProtected=True, ace <host>\<user> Allow FullControl inherited=False
variant S  stepwise shipped script  => STEPWISE-OK
variant N  stepwise, no SetOwner    => STEPWISE-OK

##### BASE: CHECKOUT (<repo-root>/scratch)   (ACL of the base directory itself, all inherited)
             ace BUILTIN\Administrators    Allow FullControl (this folder) + 268435456 (GENERIC_ALL, inherit-only)
             ace NT AUTHORITY\SYSTEM       Allow FullControl (this folder) + 268435456 (GENERIC_ALL, inherit-only)
             ace NT AUTHORITY\Authenticated Users  Allow Modify, Synchronize (this folder) + -536805376 (inherit-only generic R/W/X)
             ace BUILTIN\Users             Allow ReadAndExecute, Synchronize (this folder) + -1610612736 (inherit-only generic R/X)
variant E  threw PrivateBoundaryError/PB-WINDOWS-ASSURANCE: private-state directory Windows assurance is unavailable for
           agent-pipeline: native Windows DACL hardening failed (exit 1, UnauthorizedAccessException). The directory was
           created by this call and has been removed again.
variant H  ACL of .git and of agent-pipeline BEFORE: owner=<host>\<user>, accessRulesProtected=False, the same four inherited
           ACEs as the base directory (no ACE naming the current user)
           hardenWindowsPrivateDirectory(dir) => {"status":"unavailable","reason":"native Windows DACL hardening failed (exit 1, UnauthorizedAccessException)"}
           ACL AFTER: unchanged (still inherited, accessRulesProtected=False)
variant S  STEPWISE-FAIL step=Directory.SetAccessControl type=System.UnauthorizedAccessException hresult=0x80070005
variant N  STEPWISE-OK
```

### 4.2 Probe 2: mechanism variants and HEAD behaviour of `storagePaths` (the S5 edit is NOT applied in this tree)

```
##### BASE: TEMP
HEAD storagePaths(<fresh .git>)                  => ok (base=<tmpdir>\...\.git\agent-pipeline\guard-maintenance-window)
owner-section-only (SetOwner to the same owner)  => OK
grant user FullControl (Access), THEN shipped    => GRANT-OK, OK   assess => secure
PROTOTYPE FIX                                    => OK ownerWasSelf=True   assess => secure

##### BASE: CHECKOUT (<repo-root>/scratch)
HEAD storagePaths(<fresh .git>)                  => THREW GuardMaintenanceWindowError/GMW-DACL: window directory DACL is not owner-private
owner-section-only (SetOwner to the same owner)  => FAIL step=Directory.SetAccessControl(owner only) System.UnauthorizedAccessException 0x80070005
                                                    assess => insecure (private path DACL grants a non-owner principal)
grant user FullControl (Access), THEN shipped    => GRANT-OK, OK   assess => secure
PROTOTYPE FIX                                    => OK ownerWasSelf=True   assess => secure
```

### 4.3 Probe 3: the pre-5a72c9b61 script, and repeatability of the prototype fix

```
##### BASE: TEMP
OLD hardener script (Get-Acl + Set-Acl), first call   => OLD-OK    assess => secure
PROTOTYPE FIX, two calls on the same directory         => FIXED-OK ownerWasSelf=True (both)   assess => secure
##### BASE: CHECKOUT (<repo-root>/scratch)
OLD hardener script (Get-Acl + Set-Acl), first call   => OLD-OK    assess => secure
PROTOTYPE FIX, two calls on the same directory         => FIXED-OK ownerWasSelf=True (both)   assess => secure
```

The probe sources are scratch files (git-ignored) and are not committed; every result above is embedded here.

## 5. Which real repository state triggers it

A **non-elevated user, a repository under a path whose inherited DACL grants the user `Modify` through a group but no explicit
per-user FullControl ACE** (any directory directly below a drive root or on a secondary NTFS volume with the default root ACL;
a path under the user profile directory is NOT affected), and **a first creation or an in-place repair of a private directory**
under it. The checkout of this repository is on exactly such a volume (the `scratch` ACL above is inherited from the volume
root). Every caller of the hardener is affected on first creation: `ensureHardenedPrivateDirectory`/`ensureAgentPipelineRoot`,
`private-boundary`, `human-guard-override.secureDirectory`, `guard-maintenance-window.secureDirectory`, `governance-event-store`,
`worktree-lifecycle`, `project-authority`, `codex-onboarding-runtime` and the other modules that reference
`hardenWindowsPrivateDirectory` (`rg -l hardenWindowsPrivateDirectory plugins/pipeline-core/lib`).

Why this repository's live checkout has not broken: the preflight reports its private-state segment `present`, and an existing
segment is assessed, not hardened (`assureSegment`: `created ? harden : assess`). It breaks on a fresh clone, a deleted
segment, or the first creation of any new private leaf (for example a new `guard-maintenance-window` directory). The live
`.git/agent-pipeline` was deliberately not probed.

## 6. Proposed slices (T then F, then the S5 re-land)

Not a fixture seam: a seam in GMW50 would hide a defect that affects the PO's own checkout layout.

**Slice WIN-AP-S5-D-T (test-only, QG-04, RED pin).** Write set: `plugins/pipeline-core/lib/windows-private-state.test.mjs`
(the owning test file of the hardener; it matches none of TP-1..TP-13). Win32-only; a typed skip elsewhere. Build the
premise by ACL, not by placement, so it is red on any win32 host: create a fixture parent, remove its inheritance and grant
only `Authenticated Users` Modify (well-known SID form, no localized names: `icacls <parent> /inheritance:r /grant
"*S-1-5-11:(OI)(CI)M"`; this recipe was not run in this slice, the T dispatch verifies it), `mkdir <parent>/child` with mode
0o700, assert the premise (observed ACL of the child holds no explicit ACE for the current user), then assert
`hardenWindowsPrivateDirectory(child).status === "secure"` and that a second call on the same directory is also secure. Expected
RED at HEAD: `status "unavailable"`, reason `native Windows DACL hardening failed (exit 1, UnauthorizedAccessException)`.
The owner-not-self branch cannot be built with an ordinary token and stays unpinned (named, not hidden).

**Slice WIN-AP-S5-D-F (production, security-adjacent: private-state ACL assurance; independent Critic review mandatory).**
Write set: `plugins/pipeline-core/lib/windows-private-state.mjs`, `HARDEN_DIRECTORY_SCRIPT` and the comment above it only.
Exact edits (anchors by text):
- replace `"$me=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name",` with
  `"$meId=[System.Security.Principal.WindowsIdentity]::GetCurrent();$me=$meId.Name;$mySid=$meId.User.Value",`;
- after `"$a=[System.IO.Directory]::GetAccessControl($p,$sections)",` add
  `"$ownerIsSelf=($a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $mySid)",`;
- replace `"$a.SetOwner([System.Security.Principal.NTAccount]::new($me))",` with
  `"if(-not $ownerIsSelf){$a.SetOwner([System.Security.Principal.NTAccount]::new($me))}",`.
Behaviour: an owner that is already the current principal is no longer re-written (the Owner section is not persisted, so
`WRITE_OWNER` is not requested); an owner that differs still gets the reset, as today. Do not drop the Owner section outright.
The not-self case still needs `WRITE_OWNER` or `SeTakeOwnershipPrivilege` (unchanged); `ensureWindowsRoot`'s `ownedBySelf`
check already gates repairs upstream. Verify: T green natively on the checkout volume, `windows-private-state.test.mjs` whole
file, `agent-pipeline-root-creation.test.mjs`, `hardened-private-directory` suites (targeted native files only).

**Re-land WIN-AP-S5 as briefed** (after F): take a native `before` at HEAD for the three files first (the S5 record took none),
then apply its two-line edit from `evidence/dispatch-record-WIN-AP-S5-20261009.json` `report.text` section 6. Expected: GMW49
and GMW50 green natively; GMW48 stays red (pre-existing, unrelated); pins (b)/(c) stay red until the S4 post-images land.

## 7. Matrix and limits (disclosed)

| Axis | Status |
|---|---|
| Windows native, ordinary token, checkout on a data volume | reproduced (this report) |
| Windows native, repository under the user profile | not affected (TEMP column) |
| Windows elevated token, owner not the current user, ReFS/Dev Drive, other hosts (laptop) | not measured |
| WSL, macOS, Linux | not affected by construction (the hardener runs only on `win32`); no run in this slice |
| Claude / Codex / Antigravity runners | the module is runner-neutral; only Claude-hosted native runs were made here |
| Own repository and user repositories | both are affected whenever they sit on such a path |

- GMW50 itself was not run natively in this slice (about 300 s); its red at HEAD is established by running the production call it
  reaches (`storagePaths`) on its exact fixture placement. The T slice's first native run supplies the machine-written baseline.
- The mechanism chain in section 3 is inferred from discriminating variants, not from an access-check trace.
