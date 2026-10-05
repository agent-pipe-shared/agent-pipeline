# Intermediate candidate 2a — local report (draft, 2026-10-05)

Stamp commit 3471ba0b2 · version `0.7.0+<runner>.20261005111746.3b05196c` · base IC-1 20c035fd9. Not a qualified release.

## Contents (commits since IC-1)

| Commit | Content |
|---|---|
| e60a54183, d4dd2a361, 0d5ed7bef, 29e49b38f | git-hook runtime snapshot on native Windows: one-process DACL batch, two full source passes, content re-hash on every memo hit, buffer sized to fstat; one onboarding case 85 s → 9.6 s; mutation-proven tests |
| 2d992c477 | tracked PO decisions 2026-10-04 evening / 2026-10-05 (first part) |
| 5b45e9c90, 1baf22218, eaef7b2e3, 4fc47c4f6, 3b05196c7 | readiness root fix: foreign session descriptors warn, never lock; Verify keeps a private run record instead of a session descriptor/binding; tests translated to the run-record design |
| db17cafa4, 047e48efb | dispatch budget: 80 % checkpoint notice (Claude hook), Critic notes lane, Elephant grant script; checkpoint rule in goldfish/critic templates (all runners); Critic maxTurns 40 |

## Matrix (runner × OS × repository)

| Change | Windows | Unix (WSL) | macOS | Claude | Codex | Antigravity | own repo | consumer repo |
|---|---|---|---|---|---|---|---|---|
| Snapshot cost | tested | tested | untested (no host) | runner-neutral (git hooks) | same | same | tested | installer tests use temp consumer roots |
| Readiness root fix | tested (touched files; 3 parent-identical verify-journal failures; full file run pending) | tested (HEAD ⊆ parent failures) | untested | identity rule "C now, A in R3": no runner owns a persistent descriptor today | same | same | tested | temp fixtures; real consumer smoke pending |
| Budget checkpoint/grant | tested | tested | untested | hook-enforced | template duty | template duty | tested | consumer fixture for the grant script |

## Known remaining failures (pre-existing at the parent, not caused by IC-2a)

- Windows only: ISP001; CMI002, CMI018; 10 "installed hook:" pre-push cases; verify-evidence-producer 8 (CBV-ROOT);
  session-cleanup-binding 4; session-cleanup-recovery 3 (symlink EPERM); session-cleanup-owner-nonce 1; guard suite 58;
  v3 suite many "Windows assurance unavailable" (likely `%TEMP%` DACL grants SYSTEM/Administrators) → R4.
- Unix: session-cleanup-binding 1 (test assumes an unobservable owner); verify-journal "real SIGINT retires the owner" 1.

## Pending for IC-2b

Signed package 4 (read admission: truthful refusal codes, Glob/Grep in-root lanes, win32 quoted drive paths, missing-target
code); rg grammar flags (parked in scratch/rggram/wip); guard-dispatch `Explore`/`Plan`; dispatch-record write after
commit; source-vs-installed agent-definition budget conflict; Critic reviews of the readiness and budget fixes; full
Verify on Windows and WSL with per-suite timings; PO terminal-step reduction (sign once, agent applies); go/no-go for
existing Windows project repos.
