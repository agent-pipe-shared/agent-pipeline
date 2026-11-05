# w215: an installed source file is read once per file identity

Measured on the native Windows consumer with the 19d marks (dispatch A and B, 2026-11-05): the guard-dispatch hook is ended by the host at 330 s after 290 to 320 native PowerShell starts of about one second each. 92 of the 320 were `read-source` from `session-authority-registry.mjs` (call site `participant`), repeating in blocks of about 31.

## Cause

`participant(def)` binds each producer to the digest of its installed source files and is called by every `portsFor`, which every `stateRead` caller makes. It read every listed file again every time, and several producers share files (`session-authority-domain-owner.mjs` is listed by seven of the twelve). On Windows each read is one PowerShell start. The native backend has its own memo, but every write cleared it completely (fixed by w218), and a source read never needs more than the file's own identity to stay valid.

## Change

`lib/session-authority-registry.mjs`: new exported `installedSourceSha256(abs, producerId, {lstat, read})`. The stat of the file is made on every call (a non-regular file or a symlink is still refused with `<producer>:source-file`); the digest is kept per process in a map keyed by the file's identity string (`dev:ino:size:mtimeMs:ctimeMs:mode`). An unchanged identity returns the stored digest; a changed one reads again. `participant()` uses it. The same code runs on every platform.

## Test

`native-goldfish-host-state.test.mjs`, case `D177-source-digest-read-once-per-identity`: one read for the first call, none for the second call or a second producer sharing the file, a read again after the bytes (and size) changed, and a directory is refused without a read.

## Not covered

An in-place edit of a source file that keeps its device, inode, size, mtime, ctime and mode within one process would be missed. A plugin update replaces files between processes, and a hook process lives seconds to minutes.
