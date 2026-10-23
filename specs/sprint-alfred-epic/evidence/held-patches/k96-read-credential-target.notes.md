# K96-M7-M5-READ-BLOCKS notes (clone k96, base = rehearsal bundle C15..C28)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.
The clone still carries the edits in its working tree (nothing committed there).

## Cause
M7: `cat vault/id_rsa` fell into the generic rejected-read branch of `lib/guard/evaluate.mjs`, which labels everything that is not
outside-root as GUARD-READ-COMMAND-UNSUPPORTED ("flags or spelling, not a path"). M5: the AGY native tools already ran a credential check
since D87 (the M5 pin case was already a plain pass in the bundle: baseline 16 pass / 1 skip / 1 todo, only M7 was todo), but they printed
the generic GUARD-READ-TARGET, not the M7 typed code; the decision asks for the typed code and repair on those tools too.

## Change
- New code `GUARD-READ-CREDENTIAL-TARGET` (family GUARD-READ-*) in `lib/guard/grammar-denials.mjs`, rendered by `blocked()` (`denial-route.mjs`).
- New classifier `isCredentialReadTarget` in `lib/passive-read-policy.mjs`: same lists/rules/exceptions as `isAllowedPassiveReadTarget`
  (secret basename, credential roots, home entries, posix absolute credential paths, lexical + physical identity), narrowed to "the path itself".
- Shell lane: `qp4OperandIsCredentialTarget` (shell-grammar.mjs) + branch in evaluate.mjs. Only in-root targets (an outside-root credential read keeps
  GUARD-READ-SCOPE-OUTSIDE-ROOT: QP4-1 in guard-lifecycle-ready.test.mjs pins that). Goes through `humanOverrideRoute` like the sibling read refusals.
- AGY native lane: `nativeReadTargetRefusal` in `hooks/antigravity-pretool-guard.mjs` runs the classifier first; non-credential refusals/admissions unchanged.
Text printed (shell lane): guidance "The read target is a protected credential location (...)."; "This refusal is about the path: no change to the
command, its options or its wording can lift it."; "Repair: ask the human to put the content you need into a non-credential file inside the project
(for example under docs/ or scratch/), then read that copy."; "Alternatively the human can release this one exact read with a signed one-time override;
the route is printed below when the override planner offers one for this path, and when it reports that none is offered, the copy above is the repair."
Then the HGO block ("Human override available for this exact command ...") or "No human override route is offered ...". Native lane: same first two lines,
last line says an override is a shell-command route only (no route for a native tool call).

## Decisions I took (smallest reading)
1. The planner treats secret-named paths as non-overridable (hardBoundaryPath, HGO-NONOVERRIDABLE-PATH), so for `vault/id_rsa` the denial says truthfully
   "No human override route is offered" and the always-runnable repair is the copy. I did not widen the planner. Paths the planner does allow (for example `.env`) get the plan command.
2. Claude native Read/Grep lane (read-scope.mjs, GUARD-READ-TARGET) NOT changed: the decision names the shell route and the AGY native tools; changing it would touch
   QP4_READ_TARGET expectations in guard-lifecycle-ready.test.mjs. Open item for the PO: same typed code there.
3. A directory that merely contains a credential keeps GUARD-READ-TARGET (the path is not the cause).

## QG-04 restatements (bounded; PO decision 2026-10-23 rows 6/16, M5/M7)
- pin M6: command changed from `cat vault/id_rsa` to `rg -n --column ...` so its UNSUPPORTED assertion keeps its purpose; credential denial gets the same wording check.
- pin M5: added the typed-code assertion (stronger). M7: only `todo:` removed. New: M7b, M7c, M7d (negative controls), M5b.
- antigravity-pretool-guard.test.mjs line ~416: expected /GUARD-READ-TARGET/ -> /GUARD-READ-CREDENTIAL-TARGET/ for the credential file.
- antigravity-native-read-credential-roots.test.mjs: CRED constant for credential-target cases, directory-contains-credential cases keep CODE; D87-6 keeps the
  "same text as Claude Read" criterion for a non-credential refusal (/etc/hostname) and asserts the typed text for credential targets.
RED run: `node scratch/k96-run.mjs red ...` pin: 22 tests 16 pass 5 fail (M5, M7, M7b, M7c, M5b) for the intended reason (old text / old code).

## Counts (runner: scratch/k96-run.mjs, private TMPDIR; before = bundle code, after = clone with edits)
- read-blocks pin: before 18 tests 16 pass 1 skip 1 todo; after 22 tests 21 pass 0 fail 1 skip (U3 Linux-host skip) 0 todo.
- antigravity-native-read-credential-roots.test.mjs: after 8/8 pass. passive-read-policy.test.mjs 12/12 before and after. guard-split-contract 5/5.
- read-only-guard pin 73 pass 1 skip, claude-windows pin 14 pass 1 skip, read-command-diagnosis 9/9: identical before and after.
- antigravity-pretool-guard.test.mjs: before RED on k91 (717 s; the two GS-1 cases of another dispatch); after and guard-lifecycle-ready.test.mjs (baseline 392/389/3 skip):
  see scratch/agent-out/k96-results.txt (run `after`, started last, sequential). check-consumer-safe-paths is in the same run.

## Risks
- Classifier duplicates ~25 lines of the identity loop of isAllowedPassiveReadTarget (does not refactor the kernel function); a later list change flows through the shared constants.
- Windows: fixtures under AppData/Local/Temp stay covered by NE-5 and the AppData env roots as in the policy; unverified on a win32 host.
- New import edges: evaluate/shell-grammar/AGY adapter -> existing kernel modules only; no new module, so no kernel-list or threat-model line.
- Ratchet line effect (boundary-policy.json, report only): not measured; no new cross-boundary imports.

## Deliverables
- scratch/agent-out/K96-M7-M5-READ-BLOCKS-k96-protected.diff (evaluate, grammar-denials, denial-route, shell-grammar, passive-read-policy): applies after the bundle.
- scratch/agent-out/K96-M7-M5-READ-BLOCKS-k96-unprotected.diff (AGY adapter, its test, native-read test, the pin): green only with the protected diff.
- Proposed commit message (protected): `feat(guard): refuse credential read targets with GUARD-READ-CREDENTIAL-TARGET and a repair` / unprotected: `fix(agy): print the typed credential-target refusal on native read tools`.
  Trailers exactly: `AI-Assisted: true` and `Dispatch: K96-M7-M5-READ-BLOCKS (goldfish)`.
