# w206 — the PowerShell tool admits the node and git version probes and a read-only rg (E7; candidate 19c)

PO decision 2026-11-04: the PowerShell tool admits the same read-only commands as Bash.

## Measured, and what the chain already did

Stage 1 of the Windows consumer probe (`evidence/windows-consumer-probe-stage1-baseline-result.md`) ran eight read commands in the Bash tool and in the PowerShell tool of the installed plugin (`95d3e8145`): Bash ran all eight, PowerShell refused all eight with `GUARD-POWERSHELL-GRAMMAR`. The installed stamp predates part of this candidate's chain: since the 19c chain (the PowerShell dialect hunks before w204) a read-only `git` observation in PowerShell already gets the verdict the Bash grammar gives the same words (`isReadOnlyDiagnosticCommand`, with PowerShell syntax characters refused first), so `git status --short`, `git log --oneline -n 3`, `git diff --stat`, `git branch --show-current`, `git ls-files --error-unmatch README.md` and `git rev-parse --short HEAD` are admitted from PowerShell once 19c is installed. What was still different from Bash: `node --version` and `git --version` (the version probes the Bash lane admits) and `rg`.

## Change

`lib/guard/powershell-dialect.mjs`: exactly `node --version`, `node -v` and `git --version` (literal bare executable, never a path, no other argument) are admitted; a read-only `rg` search gets the Bash grammar's verdict through the same route git already uses (`isReadOnlyDiagnosticCommand` on POSIX-quoted words, `( ) { } ,` in an argument refused first, session read scope roots passed). Shell builtins and aliases (`cat`, `ls`, `find`, `sed`, `head`) are deliberately NOT admitted: in PowerShell they are other programs than the grammar validated (`find` is the Windows string search, `cat` and `ls` are cmdlet aliases with other flags), so a parity claim for them would be false. `lib/guard/grammar-denials.mjs`: the table of admitted PowerShell forms printed with every refusal names the new forms and says that builtins and aliases are not admitted.

## Evidence (work clone on the rehearsed chain)

- `read-command-diagnosis.test.mjs` 18/18: new RCD18 runs the guard with the PowerShell tool for six admitted commands (the version probes, two git reads, one `rg`) and thirteen refused ones (`node --eval`, a version probe with an extra flag, `git push`, `git checkout`, `rg --hidden`, `rg` outside the root, a comma argument, `cat`, `ls`, `find`, and `git.exe`/`node.exe` named by path).
- `g23-read-help`, `powershell-bypasses-onboarding-read-boundary`, `windows-greenfield-scratch-write-denied`, `escaped-and-powershell-redirects-to-a-protected-path-are-writes`, `g23-cross-runner-passive-matrix` together 63 pass, 0 fail, 1 skipped; `guard-lifecycle-ready.test.mjs` 427 pass, 0 fail, 3 skipped.

## Review and Windows proof still open

This widens what an agent-run PowerShell command may do (read-only, within the Bash grammar's own limits), so it needs the independent Critic review with the other guard changes. Whether the real Windows runners reach the new admission is proven only by the post-19c rerun of probe step W5 (the same eight commands in both tools, plus `node --version` and `git --version`).
