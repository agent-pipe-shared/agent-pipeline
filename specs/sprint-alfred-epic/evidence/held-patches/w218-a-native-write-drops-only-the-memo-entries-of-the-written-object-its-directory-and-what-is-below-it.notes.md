# w218: a native write drops only the memo entries of the written object, its directory and what is below it

## Cause

`lib/windows-owned-authority-backend.mjs` memoizes READ-ONLY native observations (`inspect`, `ancestor`, `ancestor-above-root`, `read`, `read-source`, `inspect-source-image`) per process, keyed on the request and validated on every hit against the observed object's own identity (device, file id, mode, link count, size, mtime, ctime, birthtime). Every `publish`, `create-directory` and `remove` cleared the WHOLE memo, before and after. One dispatch makes dozens of registry writes (lock create and remove, member and producer records), so the reads between them each started a new PowerShell process again; the 19d marks show 320 starts in 330 s.

## Change

A write now drops only the entries whose path is the written path, its parent directory, or below it (a removed directory), compared without case. Entries elsewhere stay, and every hit still compares the object's own identity, exactly as before. `publish`, `remove` and `create-directory` themselves are never memoized.

## Test

`session-authority-repair.test.mjs`, case `SAS20` (existing SAS11 still pins the same-file case): a publish drops the written file only; a directory removal drops what is below it; an unrelated read stays memoized; a file changed outside this module is read again because the hit is identity-checked.

## Not covered

Nothing in this change was measured on Windows. The expected effect is that the reads that follow a write elsewhere in the tree no longer start a process.
