# Design note: script-mediated writes versus the protected-path rules (2026-10-07)

Status: options for the PO (decision AQ, `plans/po-decisions-2026-10-07.md:49`: "Each gets a design note with options presented to the PO (non-blocking), then implementation in 0.7.0 with its own test slice, fix and full Critic. Order: script-mediated writes, then write lease, then worktree-per-Goldfish"). Dispatch DESIGN-SMW, interim: the dispatch tool budget ended before ADR text for the constraints marked UNSOURCED was read (see section 2).

## 1. Problem, measured from source

Record. Backlog item `2026-10-05-script-mediated-writes-bypass-protected-test-paths.md:17-24`: "an agent-authored `node scratch/<x>.mjs` rewrote the protected `plugins/pipeline-core/hooks/guard-testpath.test.mjs` (TP-2). `guard-testpath` sees Edit/Write tool calls and direct shell commands, but not files written by a script the agent runs ... Security class: a protected-path guard that holds for one write channel and not for another is not a guard." Acceptance (item:28-32): "Protected-path integrity is enforced independent of the write channel, for example a PostToolUse or pre-commit integrity check ... A regression test reproduces the codemod shape". Triage-6 entry (`plans/triage-6-po-options-2026-10-07.md:166-178`, the "script-mediated-writes integrity" section; the briefing's "section 6" is read as this entry): "Options on record. One example only ... No other options." and "Already decided? No." Item triage block is blank (item:34-39).

How the rules are enforced today (two lanes, one rule set):
- Write lane: `hooks.json:92-96` wires `guard-testpath.mjs` on `Edit|Write|NotebookEdit`; the target is read at `guard-testpath.mjs:151` (`writeTargetPath`).
- Shell lane: `hooks.json:50` wires `guard-lifecycle-ready.mjs` on `Bash|PowerShell|Read|Grep|Glob`; `lib/guard/evaluate.mjs:144-162` runs `gateStrengthShellRefusal`, then `protectedTestPathShellRefusalHit` (`lib/guard/gate-strength-lane.mjs:377`), which calls the classifier `protectedTestPathShellHit` (`lib/protected-test-paths.mjs:891`). The rules come from the shipped baseline (`protected-test-paths.mjs:100-112`; baseline unavailable becomes a match-everything rule, line 103-104).
- No integrity check runs after a tool call: the only PostToolUse entries are `hooks.json:146` (`Task|Agent`, host-commit finalize) and `hooks.json:157` (`Bash|PowerShell`, background task output binding). Neither reads a protected file.

Routes the guard SEES (command text names the target): (S1) Edit/Write/NotebookEdit `file_path`; (S2) `>` redirect targets (`protected-test-paths.mjs:781-784`); (S3) allowlisted writers `tee cp mv rm ... tar` (135-138), `sed/perl/ruby -i` (141-142), git working-tree verbs (151, 803-831); (S4) inline interpreter payloads `node -e`, `python -c`, `sh -c` ... via `OPAQUE_CODE_FLAGS` (277-294, 789-801) plus the basename-needle fallback (900-932), when the path is a literal; (S5) PowerShell write verbs by leading-verb match (303-310, 776).

Routes the guard does NOT see (5), each self-declared:
1. A script FILE the command merely executes (`node scratch/fix.mjs`): `node` has no code flag so line 789 does not fire, and it is in neither writer set, so line 809 `continue`s. Declared at `protected-test-paths.mjs:37-39`: "invisible to any classifier that can only read a command line. No string check closes this" and at `gate-strength-lane.mjs:348-350`. This is the reported incident.
2. Paths assembled at runtime inside an opaque payload (`join(dir, base)`), `protected-test-paths.mjs:40-42`: "defeat the path-token lane. The literal-basename lane ... recovers the common shape ... not all of it."
3. Child processes of allowed commands (any non-allowlisted writer: `npm run`, `make`, `node --test` helpers, a script spawning `git`): the executable list is "an ALLOWLIST of writers ... an unknown WRITER is the named residual" (126-131).
4. MultiEdit: "remains uncovered by any lane (accepted gap)" (`guard-testpath.mjs:70, 90`).
5. Symlinks, `..` traversal, case variants: "a regex guard is a tripwire, not a sandbox" (`guard-testpath.mjs:101-103`; `protected-test-paths.mjs:43-46`).
Also: the `git push` half of route 1 has a git-level backstop (pre-push hook, `protected-test-paths.mjs:48-61`); that backstop "does nothing for ... any protected-path write that is not a `git push`".

## 2. Constraints on record

- Fail closed: `guardrails/global.md:77`: "MUST make every authority-bearing gate resolve to its blocking outcome when it cannot complete its evaluation ... Authority-bearing today: the push gate, the approval gate, the testpath gate." And :80: a gate whose fail-closed property "holds only for the shapes already covered by fixtures is not fail-closed; it is well-tested". Counter-example to keep in mind: `gate-strength-lane.mjs:383-385` returns null (open) on an unreadable rule load.
- Trust: the human override is "attribution and an audit trail, not proof" (`guard-testpath.mjs:34-37`); the signed Guard Maintenance Window (ADR-0058) is the other lift (`guard-testpath.mjs:96-100`). TP-* have no in-session override for plugin source (`templates/prompts/agent-obligations.md:77-87`). `hooks.json` is itself TP-4 (agent-obligations.md:94).
- UNSOURCED in this dispatch (budget): the exact ADR lines for "signature-only trust" (ADR-0056/0058 are named, not read), for "no execution of command strings by probes", and for the Windows/Linux/WSL/macOS first-class scope (known only from PO memory, not from a repo line). The Elephant must attach file:line before the PO decision.
- Backlog item:28-32 fixes the acceptance: channel-independent, plus a codemod-shape regression test.

## 3. Options

**A. Post-hoc integrity check against pinned digests** (at the next guarded tool call, at pre-commit, at pre-push; optionally PostToolUse).
- Closes: routes 1-5 as DETECTION, independent of channel; matches item:28-30 verbatim.
- Leaves open: the window between write and check (a script can rewrite, run a weakened suite, and restore within one call); detection is not prevention; restoring needs a sanctioned routine because the agent's own revert was refused (`item:20-21`).
- Cost: medium. Hash the protected set (13 TP entries plus baseline entries) per check; pure node `fs`+`crypto`. Pin source is the open design choice (see 4).
- Windows: feasible; normalise CRLF or hash git blobs (`autocrlf`); case-insensitive FS; WSL on DrvFs works because it only reads.
- False positives: legitimate maintenance-window edits, human edits, concurrent sessions, merges and rebases touching protected files; each must move the pin through the same ceremony.
- Files: new `lib/protected-integrity.mjs` (+ its test); a check call in `lib/guard/evaluate.mjs` (reuses the `hooks.json:50` wiring, so NO hooks.json change); the pre-commit hook script. A PostToolUse variant would need a `hooks.json` entry, which is TP-4 protected with no override. Which lib files sit in the signed package: not determined here (signed-package index commit 87e9c1098 not read).

**B. Pre-execution allowlist of sanctioned scripts with declared write sets** (deny-by-default for `node x.mjs`, interpreters, runners).
- Closes: route 1 and 3 before execution, for registered scripts.
- Leaves open: a registered script may write beyond its declared set (nothing enforces the set at runtime); routes 2, 4, 5 unchanged; every interpreter and runner (`python`, `sh`, `npx`, `make`) needs an entry or stays a hole.
- Cost: high. Registry authoring and upkeep; agent-authored codemods (the incident's origin) are refused unless a human signs each script, which is signature-on-mechanics toil.
- Windows: `.cmd`/`.ps1` shims, path spelling, `npx` indirection widen the surface.
- False positives: high (every harness script and `node --test` run).
- Files: `protected-test-paths.mjs`, `gate-strength-lane.mjs`, `evaluate.mjs`, a new signed registry; all under the same guard family; registry must be signature-bound.

**C. OS-level read-only protection of protected paths during dispatches** (`chmod`/`chattr`/`chflags`, `attrib`/`icacls`).
- Closes: every channel for an unprivileged writer, including unknown tools, as PREVENTION.
- Leaves open: same-user `chmod`/`icacls` reverts it (a script can do that, route 1 again); POSIX `rename(2)` over a read-only file succeeds when the directory is writable; `chattr +i` needs root; `git checkout`/merge fail mid-operation on a read-only file.
- Cost: highest; three platform mechanisms, set and lift ceremony per dispatch.
- Windows: ACL deny works but the owner holds WRITE_DAC; WSL DrvFs ignores most POSIX modes; macOS needs `chflags`.
- False positives: git operations and harness writers erroring half-applied is worse than a refusal.
- Files: new platform adapters + dispatch lifecycle hooks (likely `hooks.json` touches, TP-4).

## 4. Recommendation (for the Elephant)

Take A, in the form "check at the next guarded tool call (existing wiring) plus pre-commit and pre-push", fail closed: any drift or missing pin refuses further Bash/PowerShell/Edit/Write calls except the sanctioned restore. Rationale: it is the only option that closes all five routes without enumerating tools, it needs no TP-4 `hooks.json` change, it matches the item's own acceptance example, and the guard family already concedes it is "a tripwire, not a sandbox" (`guard-testpath.mjs:101-103`), so a detective control with a closed-failure consequence fits. B costs most per benefit and burdens the signature path; C is platform-divergent and bypassable by the same user. Residual to disclose: the in-call window; mitigate by binding verify evidence to the pin digest.

PO question (cannot be settled by the Elephant): pin source. Git HEAD blobs are cheap but a script that runs `git commit` moves them; a signed pin manifest honors signature-only trust but adds a ceremony per legitimate protected change.

Smallest test-first slice (new files only, no hook wiring):
1. Write `lib/protected-integrity.test.mjs` first and see it red: a tmp git fixture with two protected files and a pin; a node script written by the test rewrites one file; assert `checkProtectedIntegrity({ root })` reports `drift` with that path (the codemod shape, via a real child process); equal bytes reports `clean`; CRLF-only difference reports `clean`; a missing or unreadable pin reports `unavailable` and the caller must treat it as blocking (GL-09 fault-injection case). The check only reads and hashes; it never executes command text.
2. Then add `lib/protected-integrity.mjs` to pass it. Wiring into `evaluate.mjs` and pre-commit is slice 2, after the PO fixes the pin source.
