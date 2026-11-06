# W239 held patch: Windows private reads and inspects answered by Node (O5c), ancestor chain observed natively only at the roots (O1a)

Slice C19I-W239-NODEREADS, base HEAD 79899694d0cceb1c3997bfa83942918da5feb6ab (candidate 19h applied). Closest accepted criterion: AC-108 (PRD and Spec unchanged).
Decision: PO 2026-11-06, protection loss explicitly accepted (candidate plan, after "Windows measurement of 19h"; options O5c and O1a of `native-checks-options-2026-11-05.md`). The threat model is that the pipeline confines the agent, not the human, and agent and human are the same OS user.

## Found

The 19h Windows measurement counted one `powershell.exe` start (about 470 ms) per native observation: a warm admission made 104 of them, a SubagentStop 190 (inspect 38, read 24, ancestor 20 to 25, read-source 19). The PO wants fewer checks, not a resident helper (O6a rejected).

## What it changes

All in `plugins/pipeline-core/lib/`. `windows-owned-authority-native.ps1` is NOT changed (HELPER_SHA256 and the byte-identical-copy pin stay valid).

`windows-owned-authority-backend.mjs` (O5c):
- `read` and `inspect` are answered in Node when `nodeReadsEnabled()` (real run: always; test seam: `nodeReads: true`, and a seam that fakes the spawn without the flag keeps the native answers, so the older memo cases SAS09 to SAS25 and `win-authority-rest` run unchanged). Identity from `lstatSync(..., {bigint:true})`; refusal (same native codes) of a symlink or junction (`isSymbolicLink`), a link count other than one, the wrong object kind (`WIN-AUTH-ALIAS`), a `realpathSync.native` final path that differs from the requested one case-insensitively (`WIN-AUTH-ALIAS`), a size over `maxBytes` (`WIN-AUTH-SIZE`), a missing or unopenable path (`WIN-AUTH-OPEN` with the failed path); a read compares the lstat identity (device, file id, mode, links, size, mtime, ctime, birthtime) before and after, an fstat device/file id at open, and the bytes of two passes (`WIN-AUTH-RACE`).
- The facts string keeps the native shape (12 slots for a file, 10 for a directory; `factsPattern` unchanged): volume, file id high/low, links, mode as the attributes stand-in, size, creation and write time as FILETIME from `birthtimeNs`/`mtimeNs`, and as last slot a SHA-256 of the lstat identity where the native one hashes the security descriptor. A directory's facts leave out size and times that change with membership (as the native ones did). Node-answered operations bypass the process and persisted memo (cheap; a 19h persisted entry holds native-shaped facts and is never consulted for them).
- Native PowerShell stays for create-directory, publish and remove, and for read-source, inspect-source-image and the ancestor operations. Because callers hold Node-shaped facts (registry witnesses, `expectedFacts` of publish and remove, publication read-back) and the native helper compares its own, `invokeMutating` adapts at the backend boundary: a compare-and-swap publish or a remove (1) requires the Node facts and bytes of the current file to equal the caller's witness, (2) takes the native facts of that file with one native `read` (its bytes must match too), (3) re-checks the Node witness, then hands the native facts to the unchanged native mutation with all its custody handles and read-backs; a publish or create returns the Node facts of what it wrote after cross-checking volume and file id against the native answer, so the next read agrees (registry `publication-readback`). Cost: a CAS publish or remove is two native starts instead of one; an exclusive create stays one.

`session-authority-domain-owner.mjs` (O1a): `observedWindowsChain` (now exported for the test) keeps the JS `lstat` check (real directory, not a symlink or junction) and the row of every component, but starts the native ancestor observation only for the boundary the caller derived (repository root, or the plugin root for a source module under it, via the existing `pluginRootBoundary`) and for the `<repository>\.git\agent-pipeline` root. Rows of other components have no `nativeFactsSha256`; both walks of one observation build the same shapes, so the ancestor race comparison keeps working.

## What is given up (PO-accepted; each with the concrete undetected action)

O5c, private authority files and directories:
1. Owner / DACL / allow-only-current-SID detection (`WIN-AUTH-OWNER`, `WIN-AUTH-DACL-*`): another local account that has become owner of, or been granted access to, a private authority record or directory is no longer refused at read or inspect. A changed DACL is only noticed indirectly (NTFS updates ctime, which is in a file's facts; a directory's facts leave ctime out).
2. The descriptor hash in the facts: the facts no longer bind the security descriptor, so a witness cannot tell that the ACL changed without a file write.
3. The no-delete-share custody handle held during a read: a swap or replacement between the lstat and the read is caught only by the before/after identity comparison, the fstat device/file id and the equality of the two passes, not prevented. A swap that restores identical identity and bytes is not seen.
4. Refusal of a reparse point at open time: the native open used `FILE_FLAG_OPEN_REPARSE_POINT` plus an attribute check on the handle; Node checks `lstat` and the `realpath.native` final path. A reparse point that `lstat` does not report as a link and whose resolved path still equals the requested one (for instance a non-link reparse tag on the final component) is not refused.
5. The helper-source custody of the read (the digest-verified helper bytes) no longer sits on this path.

O1a, directories on the walked chain that are not a boundary root:
6. Detection of `subst`, mapped-drive and 8.3 short-name aliases on intermediate directories (the native final-path check): a chain component reached through such an alias is accepted by the JS lstat as an ordinary directory.
7. The native owner/ACL facts of intermediate directories no longer enter the ancestor rows: a change of permissions on an intermediate directory does not change the observed chain.

Untouched: the native publish/remove/create paths and their checks, the refusal of symlinks and junctions on the chain and on every read, final-path equality, the before/after read identity.

## Checks (Linux, node, clone of the base HEAD; one suite at a time)

- `plugins/pipeline-core/lib/windows-node-authority-reads.test.mjs` (new): RED before the production edit (10 of 10 failing: the old code starts `read`/`inspect`, accepts links, has no `observedWindowsChain` export), then 10 of 10 GREEN.
- `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` 46 of 46; `plugins/pipeline-core/lib/windows-native-type-cache.test.mjs` 4 pass, 9 skipped (live Windows only); the three pins `windows-private-dacl-detail-codes-and-root-only-rule` 6 of 6, `windows-authority-ancestors-above-repository-are-human-controlled` 0 pass, 8 skipped (live Windows only), `windows-requester-ancestors-above-repository-are-human-controlled` 4 pass, 9 skipped; `digest-pinned-powershell-helpers-check-out-as-lf` 4 pass, 1 skipped; `plugins/pipeline-core/scripts/win-authority-rest.test.mjs` 21 of 21; `plugins/pipeline-core/lib/po-gate-authority.test.mjs` 1 of 1.
- The held-patch check `...check.test.mjs` (patch exists, non-empty, touches only `plugins/pipeline-core/lib/` and `plugins/pipeline-core/scripts/`).
- `git apply --check` of the patch against the repository: exit 0.
- A first version also named the plugin root inside the chain walker; the requester pin case D (the plugin root is consumed by `pluginRootBoundary` alone) caught it, so the walker now relies on the boundary its caller derives. No pin was changed.

## New case ids to register (the Elephant registers them; no harness file was edited)

`NR01` to `NR10` in `plugins/pipeline-core/lib/windows-node-authority-reads.test.mjs` (plain `node:test`, not yet in the Verify suite list; the file name is the registration unit):
NR01 read and inspect answered in Node; NR02 symlink, directory link and file below a linked directory refused; NR03 hard link, wrong kind, oversize, missing file; NR04 a file changed during a read refused; NR05 create/publish/remove still start PowerShell and the CAS takes native facts once; NR06 a stale witness is refused before anything is published; NR07 ancestor and read-source still start, Node answers need the Windows platform; NR08 chain: native only at repository root and `.git\agent-pipeline` root; NR09 no boundary: only the `.git\agent-pipeline` root, a plugin-root boundary is a root; NR10 an intermediate link or non-directory is still refused.

## Not changed, not proven

- Not run on Windows: the Node facts, the fstat-versus-lstat device and file id equality, `realpathSync.native` on a junction, a `subst` drive or an 8.3 path, and libuv's `lstat` of a junction were exercised only through POSIX stand-ins (symlinks) and the fake spawn. The cross-check after a native publish (volume and file id equal to the Node facts) rests on the same equality `nativeJoinedRead` already requires. A Windows run of a warm admission and a SubagentStop is the PO's proof step.
- The Windows-only (skipped on Linux) cases of the two ancestors pins were read: none counts spawns of read/inspect/ancestor or asserts per-component native rows through the domain owner (they call `observeWindowsAuthorityAncestor` on the backend directly, unchanged). `verify-journal.mjs` and `codex-host-process-journal.mjs` hold their witnesses in process memory and use the same operations on both sides of each comparison, so they stay coherent; the type-cache Windows cases were not read for this question.
- Records written before this change that persist native-shaped facts or ancestor-row digests (for instance the registry's entry-set digests, which include per-component native facts) will differ from a fresh Node-shaped observation once; they refuse on that first comparison. Whether the existing registry heal path recovers every such record without operator action was not checked here.
- Not converted, deliberately: `read-source` (non-private) and `inspect-source-image` stay native (the briefing names private reads and inspects); the same per-component native walks in `windows-requester-runtime.mjs` (`storageChain`) and `codex-host-process-journal.mjs` (`ancestry`) are outside the allowed files, so O1a does not reach them.
- The test seam default: a seam that fakes the spawn keeps native read/inspect unless `nodeReads: true` is set, so SAS09 to SAS25 and `win-authority-rest` are untouched; production (no seam) always uses Node.
- Existing cases were not weakened, skipped or deleted; `session-authority-repair`, `win-authority-rest` and the pins are untouched.
- Full Verify, a batch Critic review and PO acceptance remain pending. The backend and domain owner are custody-trust sources, so an independent Critic review is advisable before the operator applies the patch.

## Operator flow

1. `git apply specs/sprint-alfred-epic/evidence/held-patches/w239-windows-private-reads-and-inspects-use-node-and-ancestors-are-observed-natively-only-at-the-roots.patch`
2. Register `plugins/pipeline-core/lib/windows-node-authority-reads.test.mjs` in the Verify suite list.
3. Commit as the human operator (protected plugin sources), stamp, install; then measure a warm admission and a SubagentStop on Windows.
