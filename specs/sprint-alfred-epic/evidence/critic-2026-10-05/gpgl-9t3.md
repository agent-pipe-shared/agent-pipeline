# Critic record — GPGL-9t3 wrapper brace-expansion red pins

- Review object (enumerated): `c789a1171` (GPGL-9t3, test-only, `plugins/pipeline-core/lib/git-cmd.test.mjs`)
- Spec: `guardrails/git.md`, `guardrails/quality-gates.md`, `guardrails/security.md`; registry: gpgl-9t2 F1
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime
  prompt; effort max); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: 22 of 24
- **Verdict: FAIL** — one major, one minor finding. The 27 pinned rows are each correct.

## Findings

### F1 — major: the "not pinned" rationale is false for nested invocations

`git-cmd.test.mjs:853-855` excludes `dash`, `pwsh`, `powershell` and `cmd` as false-positive territory (they do not
brace-expand). A non-expanding wrapper whose inner command starts a shell that does expand really pushes. Read-only
probes of the unchanged `commandIsGitPush` (brace-free control first):
`cmd /c "bash -c 'git push origin main'"` → true, `cmd /c "bash -c 'git {push,origin} main'"` → **false**; the same
pattern for `pwsh -c` and `dash -c` → **false**. A fix following this comment can turn all 27 rows green and leave
these open. Spec-ref: GIT-04 (`guardrails/git.md:69`); QG-07 (`quality-gates.md:95`); SEC-10 (`security.md:165`).

### F2 — minor: here-string / stdin forms of expanding shells are not pinned

`bash <<< 'git {push,origin} main'` and `zsh <<< 'git {push,origin} main'` → **false** (brace-free controls true). The
Claude route's closed grammar may refuse `<<<` (not verified); the classifier contract does not. Spec-ref: GIT-04;
QG-07.

## Deliberately not flagged (summary)

27 rows (8 zsh, 6 sh, 4 bash, 7 ssh, 2 env/NAME=value) as claimed, 25 FAIL + 2 PASS (evidence lines 275, 292); all 24
brace-free controls true, so brace expansion is the only variable; the corrected line-793 comment and the new 848-852
comment match `git-cmd.mjs:640-641, 699-717`; `sh` rows consistent with the every-reading rule; additive only; one file,
not protected; English; trailers clean. Out of this commit's scope (pre-existing classifier scope, not probed): unrouted
expanding shells (ksh, fish, csh/tcsh) and wrappers after `;`/`&&` (the wrapper branch is positional).

## Trajectory — consistent

`../night-2026-10-05/gpgl-9t3-red.txt`: exit 1, 199/290, GPGL9T3 25 FAIL + 2 PASS; bound by content (27 lines match
the diff verbatim; tree byte-identical to `c789a1171`).

## Briefing violations

Borderline, self-reported: the diff field characterised the object ("test-only commit adding red pins") and narrowed
the reading surface. Treated as scope metadata; noted for future briefings.

## Elephant decision — stop the pin chase, escalate to Q12

Four consecutive pin rounds (GPGL-9t, -9t2, -9t3 and this review) each found a new family of missed pushes: brace
expansion, wrappers, nested wrappers, here-strings, wrappers after separators. The red table cannot enumerate the
shell's grammar any more than the deny-list classifier could. No further pin round is dispatched; the evidence goes to
PO question Q12 as support for option (B) extended to fail closed on any `{`, `<<<`, nested shell invocation, or wrapper
anywhere in the command, not only in the first position.
