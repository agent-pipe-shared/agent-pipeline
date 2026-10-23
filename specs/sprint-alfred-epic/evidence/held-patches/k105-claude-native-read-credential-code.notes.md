# K105-CLAUDE-NATIVE-READ-CREDENTIAL-CODE notes (clone k96, continues K96; base = rehearsal bundle C15..C28 + K96 edits)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
The clone `scratch/clones/k96` still carries the K96 AND K105 edits in its working tree (nothing committed there).

## Cause
`readToolScopeVerdict` (lib/guard/read-scope.mjs) ended every refusal of a native Read/Grep/Glob in the generic text
"GUARD-READ-TARGET: use an exact passive path outside protected credential roots." (no path-as-cause statement, no repair), also when the
path itself was a credential. K96 gave the shell lane and the Antigravity native tools the typed code; the Claude native lane was left (K96 open item).

## Change (smallest reading)
- read-scope.mjs only: before the final generic refusal, `nativeReadTargetIsCredential()` asks the K96 classifier `isCredentialReadTarget`
  (passive-read-policy.mjs, recursive:true like the allow check) about the Read `file_path`, the Grep/Glob `path`, and for a Glob with a literal
  (wildcard-free) selector the joined `path/selector`. True -> `nativeReadCredentialTargetDenialText()` (the K96 builder in grammar-denials.mjs, the
  SAME function the Antigravity adapter calls: nothing copied, nothing moved; K96 had already placed it in the shared place).
- No behaviour change for the other two routes (adapter, evaluate, denial-route untouched). The `GUARD-READ-TARGET-MISSING` branch is evaluated before and unchanged.
- Kept GUARD-READ-TARGET: outside-root non-credential Read, Grep on a directory (also one that merely contains a credential, e.g. `vault`),
  Glob `../*`. An in-root non-credential file stays allowed.
- Decisions: (1) text is the NATIVE variant (last line: "A signed override is a shell-command route only; a native read tool has none"), as on Antigravity: a native tool call has no override route. (2) A credential target OUTSIDE the root (e.g. `~/.ssh/id_rsa`) on the native Read now also gets the typed code (identical to the Antigravity classification order; the shell lane's QP4-1 outside-root rule is untouched). No existing expectation pinned the old code for it.

## QG-04
- Pin P5 (read-blocks pin): `assert.match(blocked.text, /GUARD-READ-TARGET:/u)` -> `/GUARD-READ-CREDENTIAL-TARGET:/u` for `Read vault/id_rsa`, with an in-file bounded justification citing the PO decision (2026-10-23, asked after K96). Intent unchanged: refused with a path-caused code, never MISSING.
- `hooks/guard-lifecycle-ready.test.mjs`: NO edit needed. All `QP4_READ_TARGET` expectations there concern directories/globs/outside-root non-credential targets (QP4-5 credential cases assert only "not MISSING"); the suite is green unchanged (byte-identical, so also no restatement of non-credential expectations).
- New case M8 in the read-blocks pin (Read abs/relative/forward-slash, Grep with/without glob, Glob literal selector of `vault/id_rsa` -> typed code + repair + native override sentence; negative controls keep `GUARD-READ-TARGET:`; in-root Read/Grep stay allowed).
RED: `node scratch/k105-run.mjs red <pin>`: 23 tests, 21 pass, 1 fail (M8, assertion: expected /GUARD-READ-CREDENTIAL-TARGET/ on old text), 1 skip. GREEN: 23 / 22 pass / 0 fail / 1 skip (U3 Linux skip).

## Counts (alone, sequential, private TMPDIR; runner scratch/k105-run.mjs, log lines in scratch/agent-out/k105-results.txt)
- read-blocks pin: K96 state 22 tests 21 pass 1 skip -> now 23 / 22 / 0 fail / 1 skip.
- lib/passive-read-policy.test.mjs 12/12; hooks/antigravity-native-read-credential-roots.test.mjs 8/8; lib/guard/guard-split-contract.test.mjs 5/5.
- hooks/guard-lifecycle-ready.test.mjs 392 tests / 389 pass / 0 fail / 3 skip (468 s) = baseline.
- lib/pins/read-only-guard-admits-execution-and-output-options.test.mjs 74 tests 73 pass 1 skip; claude-windows pin 15 tests 14 pass 1 skip (briefing said 14 pass / 1 skip: same pass count, matches); read-command-diagnosis 9/9; check-consumer-safe-paths.test.mjs 9/9.
- antigravity-pretool-guard.test.mjs NOT run (adapter and builder text untouched).

## Deliverables (INCREMENT on top of K96; apply K96 first, then K105)
- scratch/agent-out/K105-CLAUDE-NATIVE-READ-CREDENTIAL-CODE-k96-protected.diff (lib/guard/read-scope.mjs; applies after the bundle and the K96 protected diff).
- scratch/agent-out/K105-CLAUDE-NATIVE-READ-CREDENTIAL-CODE-k96-unprotected.diff (the read-blocks pin: M8 + P5 restatement; green only with the protected diffs).
- Method: base snapshot scratch/agent-out/K105-base-snapshot.diff (git diff of the clone before editing) -> throwaway clone, snapshot committed, current files copied, git diff = increment.
- Verified by Node execFileSync (scratch/k105-export.mjs) in a throwaway clone of k91: K96 protected + unprotected applied, then `git apply --check` for both K105 diffs OK and applied; the resulting 10 changed files are hash-identical to the k96 clone working tree.

## Risks
- Reading note: the Glob wildcard-selector case classifies only the base `path` (a wildcard listing inside a credential directory keeps GUARD-READ-TARGET).
- Windows unverified (same classifier and fixtures as K96).
- Ratchet effect (boundary-policy.json, report only): read-scope.mjs gains imports of two modules in the same lib/guard and lib/ directories it already imports from; no new cross-boundary edge, not measured by the checker.
- Kernel list: no new module, no kernel-list or threat-model line.

## Proposed commit messages (trailers exactly two lines)
Protected (operator): `feat(guard): name a credential target with GUARD-READ-CREDENTIAL-TARGET on the Claude native Read, Grep and Glob lane`
Unprotected: `test(pins): pin the typed credential refusal on the Claude native read lane; restate P5 to the typed code (QG-04, PO decision 2026-10-23)`
AI-Assisted: true
Dispatch: K105-CLAUDE-NATIVE-READ-CREDENTIAL-CODE (goldfish)
