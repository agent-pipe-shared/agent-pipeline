---
schema: pipeline.backlog-item.v1
id: pipeline.write-lane-containment-may-share-read-lane-dotdot-bypass
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
tracking: "Nova B — a T1 Critic reviewing NVA-B-READCONTAIN-1's symlink-containment fix found that the read-scope lane's new realpath check still admits a `<symlink-inside-root>/../<outside>/<file>` argument, because `path.resolve()` collapses the `..` lexically before any symlink is examined. The write lane's own `isPathWithinRealpathedRoot` — the pattern the read-lane fix was modeled on — opens with the identical `resolve(root, filePath)` call, before its own existence/realpath walk. Whether this is actually exploitable for a WRITE depends on a fact this session could not verify from inside the repository: how the host tool that performs the actual Edit/Write file mutation resolves the same path string."
done_when: manual
source: "T1 Critic re-Critic round 2 on NVA-B-READCONTAIN-1 (2026-09-06), 'Not reached' section: 'Untested candidate, delta-introduced asymmetry... Not verified, not a finding.' Traced further by the Elephant while triaging that report."
---

# The write lane's symlink-containment check may share the read lane's `..`-through-symlink bypass

## The confirmed read-lane bug (for reference — already being fixed, NVA-B-READCONTAIN-1)

`guard-lifecycle-ready.mjs`'s read-scope containment resolves a candidate
argument via `commandPath(value, root)`, which calls `resolve(root, value)`.
`path.resolve()` performs pure lexical normalization — it collapses `a/../b`
to `b` as a STRING operation, with zero filesystem awareness, before any
`existsSync`/`realpathSync` call ever runs. So an argument shaped
`<symlink>/../<outside-dir>/<file>`, where `<symlink>` is a real symlink
planted inside the project root pointing elsewhere, collapses to a string
that reads as trivially inside the root — even though the ACTUAL shell
command (`cat`, `rg`, …) is later executed by the OS, which resolves the
same string component-by-component, dereferencing the symlink FIRST and only
then applying `..` relative to the symlink's real target. The guard's
string-math prediction and the shell's kernel-level resolution diverge, and
the guard admits a read that actually lands outside the project root.

Reproduced live (T1 Critic, 2026-09-06): a probe fixture confirmed
`isReadOnlyDiagnosticCommand()` admits the `.. `-through-symlink shape while
refusing the direct-symlink shape, and a `cat` of the same argument printed
content from outside the fixture's project root.

## Why the write lane is a real, open question — not yet a confirmed bug

`isPathWithinRealpathedRoot()` (same file, ~line 1520 — backs
`isProjectWritePath()` and `isClaudeSessionMemoryWritePath()`) opens with the
structurally identical `const requested = resolve(root, filePath);` before
its own ancestor-walk-then-realpath check. The STRING-LEVEL shape of the bug
is present.

Whether it is actually exploitable depends on a fact outside this
repository: when the host tool (Claude Code's own Edit/Write/NotebookEdit
implementation) performs the actual file mutation, does it:

- **(a)** resolve the SAME `filePath` value through its own equivalent of
  `path.resolve()` before opening the file — in which case the write lands
  on the literal, lexically-collapsed in-root path (e.g. `<root>/<outside>/<file>`
  as a real, boring new file under root), and there is no divergence, no
  bypass, and this item can close as "shape present, not exploitable here";
  or
- **(b)** passes a path string closer to the original argument to an
  OS-level open/write call that resolves symlinks and `..` in kernel order —
  in which case the identical bypass shape as the read lane applies, and a
  planted in-root symlink could redirect a nominally-contained write outside
  the project root.

This session could not determine which, since the host tool's internal path
handling is not part of this repository. This is exactly the discipline the
reviewing Critic itself used: it named the asymmetry, named the exact
discriminating check, and declined to call it a finding without verifying it.

## Discriminating check (from the Critic's own report)

Trace `root`'s origin into `isProjectWritePath`'s/`isClaudeSessionMemoryWritePath`'s
callers and confirm whether the caller already realpaths `root` before
passing it in (the doc comment at `isPathWithinRealpathedRoot`'s definition
claims callers must). Separately — and this is the part that actually
resolves the open question — construct the same `<symlink>/../<outside>/<file>`
fixture against a REAL Edit/Write/NotebookEdit tool call (not a unit test of
the guard function in isolation) and observe where the byte content actually
lands.

## Acceptance criteria

- The discriminating check above is run and its result recorded here:
  either "not exploitable, the host tool's own resolution collapses
  identically" (with the evidence), or "exploitable" (with a reproduction).
- If exploitable: `isPathWithinRealpathedRoot` (and any sibling using the
  same `resolve()`-then-realpath shape) is fixed using the same technique
  NVA-B-READCONTAIN-1's follow-up correction applies to the read lane —
  realpath the RAW, unnormalized candidate directly, never a
  pre-lexically-collapsed one — and covered by a symlink+`..` regression
  test mirroring the read lane's.
- If not exploitable: this item documents why (the specific host-tool
  behavior that closes the gap) so a future host-tool change that removes
  that protection is a known regression risk, not a silent one.

## Measured 2026-09-06

**Step 1 — the cheap trace (root's own realpath status).** Both callers
realpath `root` before it ever reaches `isPathWithinRealpathedRoot()`,
confirming the doc comment's claim (`guard-lifecycle-ready.mjs` lines
1516-1520):

- `isProjectWritePath()` (lines 1537-1539) is called from
  `evaluateLifecycleReadyGuardCore()` at line 4940. That function derives
  `root` at lines 4809-4815:
  `root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requestedRoot))`
  — already realpathed before use.
- `isClaudeSessionMemoryWritePath()` (lines 1586-1592) obtains its boundary
  from `claudeSessionMemoryDirectory()` (lines 1564-1577), which itself calls
  `realpath(candidate)` at line 1572 and returns that realpathed value as
  `memoryDir`, passed into `isPathWithinRealpathedRoot(filePath, memoryDir, ...)`
  at line 1591 — also already realpathed.

So the root boundary itself is not the exposed surface in either caller; any
divergence would have to come from how the untrusted `filePath` argument is
resolved — the `resolve(root, filePath)` lexical collapse at line 1526,
structurally identical to the read lane's bug.

**Step 2 — the decisive observation.** Built entirely under `scratch/`:

- `scratch/writecontain-fixture-NVA-B-WRITECONTAIN-1/root/` — fixture
  "project root".
- `scratch/writecontain-fixture-NVA-B-WRITECONTAIN-1/outside/` — sibling
  "outside" directory (left empty).
- `scratch/writecontain-fixture-NVA-B-WRITECONTAIN-1/root/link` — a real
  symlink pointing at the absolute path of that sibling `outside/` directory.

One real `Write` tool call, target `file_path`:
`scratch/writecontain-fixture-NVA-B-WRITECONTAIN-1/root/link/../outside/marker-write-test.txt`,
content a harmless marker string identifying the fixture and the two
candidate outcomes.

Outcome of the tool call itself: **admitted outright, no guard refusal of any
kind** — the write proceeded and the tool reported success.

Where the bytes actually landed (verified with `ls -la` on the fixture root,
the sibling `outside/` directory, and the nested path, plus reading the
marker file's content — captured in
`evidence/NVA-B-WRITECONTAIN-1-observation.txt`):
`scratch/writecontain-fixture-NVA-B-WRITECONTAIN-1/root/outside/marker-write-test.txt`
— a **brand-new real directory** named `outside`, created directly under the
fixture root, distinct from both the symlink and the real sibling `outside/`
directory it points at. The real sibling `outside/` directory (the symlink's
actual target) stayed empty throughout; the marker content never reached it.

**This supports (a), not (b).** The host tool's own Write path resolution
collapsed `link/..` as a pure lexical operation — the same thing
`path.resolve()`/`path.join()` would do — and materialized a boring new
directory that happens to share a name with the symlink's target, without
ever dereferencing the symlink. The guard's own lexical prediction
(`resolve(root, filePath)`) and the host tool's actual write location agree
in this fixture: no divergence, no bypass observed.

Scope caveat: only the `Write` tool was exercised (per the "fix nothing,
measure one thing" mandate of this dispatch, one real tool call). `Edit` and
`NotebookEdit` were not separately tested and are not covered by this
observation; if they route through a materially different path-resolution
step than `Write` does, that would need its own measurement.

**Recommendation:** close this item as "shape present, not exploitable
here" for the `Write` tool, with the scope caveat above recorded rather than
silently generalized to `Edit`/`NotebookEdit`. The specific host-tool
behavior that closes the gap: Claude Code's `Write` tool resolves its
`file_path` argument lexically (matching `path.resolve()`/`path.join()`
semantics) before opening the file, without dereferencing intermediate
symlinks — a future host-tool change to kernel-order resolution would
reopen exactly this gap and is the regression risk to watch for.
