# Windows host ACL scope — source delivery

Source `7d3659ebe32778d4a8edf0852cab43972950a652`, tree
`27018583532b6e3a837c7f75210ea88117c6df6d`. Direction: D145 in the
[decision register](../../plans/po-decisions-2026-10-25-fix-wave.md).
The normal active-hook commit succeeded. No operator commit, actual host ACL
mutation, install, stamp, push or release occurred.

Ordinary Windows host/project/plugin/source and process-image ACLs remain
observable and bound to their security-descriptor digests, but foreign owner
or write grants no longer categorically block those paths. Strict private
Pipeline custody, signatures, content/CAS and physical-path checks remain.
Readiness rejects missing or malformed observations. The public
[boundary document](../../../../docs/windows-authority-boundaries.md) explains
the weaker Windows local-account guarantee and the specific additional POSIX
owner/mode checks, without claiming same-user agent isolation.

## Focused qualification

| Check | Passed | Skipped | Exit |
|---|---:|---:|---:|
| Readiness, registered WAR001–WAR009 | 9 | 0 | 0 |
| Authority ancestor pin | 0 | 8 native Windows | 0 |
| Requester/module-context pin | 4 structural | 9 native Windows | 0 |
| Helper digest pin | 4 | 1 native Windows | 0 |
| Native type cache | 4 | 9 Windows/PowerShell | 0 |
| Shared process observer | 4 | 1 Darwin | 0 |
| Consumer-safe paths | 9 | 0 | 0 |

These are 34 executable passes, 27 Windows/PowerShell skips and one Darwin
skip. Native skips are not native acceptance. The real executable-under-grant
path, NTFS private negatives and the affected Claude Windows Greenfield route
remain unverified on this host. No captured native policy RED baseline exists.
Resource headroom is unknown; no product resource limit was invented.

The qualifying captures are the seven `*-isolated-final.json.txt` files.
Their corrected preload has SHA-256
`2935b840993c8a3de11d8c242979ecacb9dae0178477d8e489897212d300dc11`;
its exact bytes and hash capture are retained. It constructs synthetic identity
without calling real `os.userInfo()`, isolates HOME and temporary paths, and
propagates its encoded import URL to descendants before test imports.
Earlier captures are isolation-limited and do not qualify the final isolation
claim: their old wrapper called real userInfo before replacement, omitted
descendant propagation and did not isolate Linux tmpdir. Both wrapper versions
and earlier outputs are preserved; no claim of absence of side effects is
derived from those earlier runs. All seven focused suites were re-executed
after this concrete prerequisite correction on unchanged product bytes.

The original policy examiners were changed for the explicit PO direction.
Private negatives now grant a foreign principal access to an existing private
directory, rather than incorrectly inferring insecure children from a writable
parent: the production creator makes protected private children. Physical
alias controls remain. Registered readiness IDs were preserved; additional
missing/malformed assertions live in WAR007 and WAR003 isolates exact faults.

The [custody record](custody.json) binds all ten integrated files to their
actual committed blobs, the complete inert patch and the retained captures.
Main postimages matched the worker postimages exactly; intervening Main
changes were documentation only and no integration conflict was resolved.
The initial failed preload/stale-assertion captures and superseded ten-case
readiness mapping remain separate. The intermediate registration capture was
nine cases, despite the owner's report grouping it with older ten-case output;
the final exact-faults capture is the qualifying nine-case result.

This was a method-only D143 worker/integration course. The initial worker
preflight used the sandbox boundary in error; later Node/Git/test calls used
the declared host boundary. This deviation is retained, with no invented
native dispatch/model receipt or budget grant. No independent review PASS is
claimed. The operative late Critic batch, final Verify/Security and acceptance
remain pending. The installed Greenfield build is unchanged; this source fix
belongs in the next stamped candidate.
