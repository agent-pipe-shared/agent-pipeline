# D165 S5 held patch: Windows findings W1 and W2

Patch: `d165-s5-win-findings.patch` (git diff --binary against HEAD 4832448b8d4804431bcbf9d5291f22bf492fe71c; 4 files, +92/-23). Slice W6-D165-S5-WINFINDINGS-20261026, criterion AC-127.

## Critic requirement

This touches a trust-anchor ceremony path (`bootstrap-trust-recovery.mjs`). An independent Critic review is REQUIRED before the operator applies it.

## Cause and change

- W1 (premise confirmed by reading, not reproduced): `confirmOnTerminal` opened a `readline/promises` interface, asked one question and closed it. A second pasted line sat in readline's buffer and was dropped on close. Lines changed in `bootstrap-trust-recovery.mjs`: the `readline/promises` import is removed and `readSync` imported; `confirmOnTerminal` now takes an injectable `readLine(prompt)` (default: writes the prompt, then `readTypedLine(0)`); new exported `readTypedLine(fd, read, maxBytes)` reads byte by byte up to the newline (pattern of `po-human-approval.mjs` `defaultReadConfirmation`, copied locally, that file untouched); `main`'s third parameter is now `readLine`. Prompt texts, banner, `.trim()`, `BTR-NOT-CONFIRMED` and all other refusals are byte-identical. Decoding is plain UTF-8 (what readline did); `decodeTypedLine` of `lib/chat-gate-ceremony.mjs` was deliberately not imported, to keep the trust-anchor script's import closure unchanged.
- W2 (confirmed): `session-authority-repair.mjs` release-lock returned 0 for status `retained`. Now `released.status === "retained" ? 2 : 0`; JSON unchanged. A new optional `releaseDeps` option of `runSessionAuthorityRepair` (spread into `releaseSessionAuthorityLock`, mirrors `waitDeps`) is the test seam; default `{}` changes nothing.

## Tests (cases prefixed D165-S5)

- `bootstrap-trust-recovery.test.mjs`: new "D165-S5 a second pasted line is not swallowed..." and "D165-S5 a single-line answer behaves as before and an end of input ... fails closed". The existing case "recovery confirmation puts the digest request in the readline question" was adapted, not weakened: readline no longer exists, so it now asserts the same intent (the digest request is the reader's prompt argument, never written separately; banner still written; answer trimmed, now with CRLF).
- `session-authority-repair.test.mjs`: new SAR15 (retained -> exit 2, JSON postcondition unchanged; released -> exit 0).
- RED at the original code: bootstrap-trust-recovery.test.mjs failed as a file (new export `readTypedLine` missing), SAR15 failed. Baseline at HEAD before any edit: all three suites green (21 tests, 0 fail).

## Counts (GREEN in the clone, node --test)

24 tests, 24 pass, 0 fail: bootstrap-trust-recovery 8 (6 old incl. the adapted one + 2 new... file total as reported by node), session-authority-repair SAR01-SAR15, guard-maintenance-window-kernel-closure 11 passed, 0 failed. `git apply --check` of the patch in a fresh clone of HEAD: exit 0.

## Preimage SHA-256 (HEAD)

- 592e8459dbf2d17bfd7e6b1461edd5e91c6b6e9d28a5efb59ec31fbf52e59ed6 plugins/pipeline-core/scripts/bootstrap-trust-recovery.mjs
- 6414f848b29f06bbc590a1afc329c9a2656833ab3adae7a70d0b8c6a11f79555 plugins/pipeline-core/scripts/bootstrap-trust-recovery.test.mjs
- 2aa757660de58a1566c0077b4756bdb9786d697144490ca5d8833d9593acfdde plugins/pipeline-core/scripts/session-authority-repair.mjs
- d8fbe23af100bbd210a1597ef0f70e9d62377f5c91e05a8831e2e6b43651d030 plugins/pipeline-core/scripts/session-authority-repair.test.mjs

## Proposed commit message

```
fix(recovery): read one line per trust prompt and exit non-zero on a retained lock release

A pasted second line was dropped when the readline interface closed; the byte-wise
reader consumes exactly one line per prompt. release-lock now exits 2 when the lock
was retained instead of released. Test seams: injectable line reader, releaseDeps.

AI-Assisted: true
Dispatch: <ID> (elephant-exception)
```

(Use the dispatch trailer the operator's authorship route requires.)

## Operator flow

1. After the Critic review: `git apply` the patch from the repository root.
2. `git add -u`
3. Commit with `--no-verify` (kernel/trust-anchor paths), using the message above.
4. Stamp, then install.
5. Run Verify as the Coordinator.

## Not done

Full Verify, batch Critic and PO acceptance are pending (parent-owned). Native Windows qualification not performed.
