# Recon PF-97: Critic route path character set (notes only, candidate b9e3f5483)

Pattern text below is described in words where it contains backslashes (the evidence guard refuses backslash runs); read the cited source lines for the exact text.

## Summary

1. The refusal that stops round 2 is `PATH` in `plugins/pipeline-core/lib/critic-review-lineage-core.mjs:45` (anchored; no leading slash; no backslash; class A-Za-z0-9 dot underscore slash hyphen; length 1-512), used by exported `safePath` (line 96) at lines 131, 135, 150, 167, 297; `compileRegisteredCriticReviewLineage` (`critic-review-lineage.mjs:426`) throws `CRL-V2-PACKET` through `packetCode` (core:123).
2. Same narrow class, same effect: `review-economy.mjs:65` `SAFE_PATH` (240, via `validRepoPath` line 83, used at 178, 201, 950, 955) and `review-economy.mjs:253` `CRITIC_SAFE_PATH` (512, via `criticPath` line 265).
3. JSON schema patterns with the same class: `critic-review-lineage.schema.json:445`, `review-attempt.schema.json:124`, `course-decision.schema.json:14`, `release-critic-review-scope.schema.json:55` (also `workflow-fallback-receipt.schema.json:77-78`, `backlog-state-transaction.schema.json`, `local-worker-supervisor.schema.json:43`: not on the Critic route).
4. Also refuse the COLON (a legal file name character): `critic-course-admission.mjs:365` (`safe`) and `critic-diagnostic-evidence.mjs:15`. Possibly deliberate; PO decision below.
5. Already permissive (no change): `critic-packet-preflight.mjs:95` `normalizePacketPath` (240 UTF-16 units; refuses leading/trailing whitespace of the whole path, backslash, NUL, absolute, `./` prefix, trailing slash, empty/`.`/`..` segments) and `feature-package-registration.mjs:73` `repositoryRelative`. `critic-generic-batch.mjs` `paths()` uses `normalizePacketPath`; its `logical()` (lines 51-53, 128 chars, alphanumeric start) validates logical work/criterion IDs, NOT repository paths: leave it.
6. File lists are read with `-z` everywhere on the route (section 1); no octal-escape string reaches a validator today.
7. Reproduced with real code: all 6 PO fixture paths plus `src/a:b.ts` and a trailing-space name are refused by the core predicate and by the copied economy/schema patterns; `normalizePacketPath` accepts all. A leading dash already passes.
8. Proposed fix: ONE exported predicate (change `safePath` in the core): denied set only (C0 controls incl. NUL/newline, DEL, backslash, leading slash, empty/`.`/`..` segment, 512 bytes); `review-economy.mjs` imports it instead of two regexps; four JSON schema patterns replaced (section 3).
9. NOT reached: the staged production walk (bindings, registration verbs, lineage compile, batch admit/claim, finalizer) on a real fixture; the survey of test files pinning the old pattern; the survey of unquoted path interpolation in hints.
10. No repository change; no RED/GREEN cases (Goal says notes only, DoD says test-first: contradiction, Goal followed; section 4).

## 1. Validators and file-list acquisition

| File:line | Check | Guards | On the Critic range route? |
|---|---|---|---|
| critic-review-lineage-core.mjs:45,96-99 | PATH + 512 bytes + segment check | packet.diff.path, diffPaths, row.changedPaths, coverage.changedPaths, record.diff.changedPaths | YES (the CRL-V2-PACKET refusal) |
| review-economy.mjs:65,83-86 | SAFE_PATH 240 | changedPaths input (201), invariants map (178), receipt authority/permission paths (950,955) | YES (economy projection) |
| review-economy.mjs:253,265-270 | CRITIC_SAFE_PATH 512 | critic review economy path lists | YES |
| critic-review-lineage.schema.json:445 | pattern, same class | lineage record path | YES if a validator applies the schema |
| review-attempt.schema.json:124, course-decision.schema.json:14 | pattern 240, same class | attempt / course decision paths | YES |
| release-critic-review-scope.schema.json:55 | pattern 512, same class | release scope path | release route only |
| critic-course-admission.mjs:365 | refuses backslash, NUL, CR, LF, colon, leading slash, over 512, bad segments | evidence entries | YES (only colon is new) |
| critic-diagnostic-evidence.mjs:15 | refuses backslash, C0 controls, colon, over 240 | diagnostic evidence paths | YES (only colon is new) |
| critic-packet-preflight.mjs:95 | permissive (item 5) | packet paths | already permissive |
| feature-package-registration.mjs:73 | permissive | registration paths | already permissive |
| critic-candidate-packet / critic-export-receipt schemas | only hex id/oid patterns | no path pattern | no change |

Not found with the narrow class: critic-dispatch-preflight.mjs, session-critic-finalizer.mjs (SAFE_ID line 117 is an id), critic-correction-input-bindings.mjs. Confidence moderate: searched for the class text and a few path-test shapes, not for other spellings such as the word-character shorthand.

Acquisition (confidence high): `-z` at critic-packet-preflight.mjs:266 (`ls-tree -r -z`) and :278 (`diff --name-only -z`), critic-generic-batch.mjs:470, critic-course-admission.mjs:181,195,460,473,493,517, feature-package-registration.mjs:630, critic-correction-input-bindings.mjs:104 (`diff-tree -r -z`), critic-dispatch-preflight.mjs:226 and critic-review-lineage.mjs:414 (`ls-tree -z`). Fixture proof: `git diff --name-only` without `-z` prints the umlaut name as a double-quoted string with octal escapes; with `-z` the real name arrives. A future caller must keep `-z`.

## 2. Reproduction

Driver: scratch/agent-out/w7cz/driver.mjs (spawnSync only; shared clone at the candidate; fixture repo with base and candidate adding the 7 PO paths plus `src/a:b.ts`, `src/-lead.ts`, `src/trail .ts`, `src/ok/plain.ts`). Results of the real exported `safePath` and `normalizePacketPath` and patterns copied from source:

- core `safePath`: REFUSED for all 7 PO paths, `a:b.ts`, `trail .ts`; ok for `-lead.ts`, `plain.ts`.
- review-economy SAFE_PATH and the schema patterns at 124/14/445/55 (copies): the same set REFUSED.
- `normalizePacketPath`: accepts all 11.
- course-admission `safe` and diagnostic-evidence check: REFUSE only `src/a:b.ts`.
- Preflight CLI on the range (`--root --base --candidate --spec`): exit 1, `status rejected, code CDP-EVIDENCE-REQUIRED`, refused before any path verdict (the fixture lacks evidence arguments).

Confidence: high for the validator table; the production entry points were NOT walked.

## 3. Design

- One predicate: change `safePath` (core:96) so the character rule is: length 1-512, no leading slash, no backslash, no C0 control or DEL character; keep the existing 512-byte and segment checks at lines 98-99. Keep the exported name. `review-economy.mjs` imports `safePath` (check for a circular import first) and deletes `SAFE_PATH` and `CRITIC_SAFE_PATH`; `validRepoPath` and `criticPath` become wrappers (unify 240 to 512).
- JSON schema patterns (ECMA 262; no `u` flag assumed, so use a code-unit class): keep each schema's existing lookaheads (leading slash, double slash, dot segments, backslash) and replace only the class `[A-Za-z0-9._/-]` by the negated class of U+0000-U+001F and U+007F. Length limits stay as in each schema (items count UTF-16 units, so a bytes limit is enforced by code only).
- Colon: remove from `critic-course-admission.mjs:365` and `critic-diagnostic-evidence.mjs:15` only if the PO wants ALL legal characters; colon may be deliberate there.
- Tests/pins: NOT surveyed. Next slice must search `CRL-V2-PACKET`, `CRL-SHAPE`, `CGB-SHAPE` and the old class text in `*.test.mjs` (critic-review-lineage, review-economy, critic-course-admission, critic-generic-batch).
- Hint text interpolating paths unquoted: NOT surveyed (`CCI_COMMAND_HINT` at critic-dispatch-preflight.mjs:193 uses placeholders only).
- Slices (each <= 40 calls): S1 (M) core `safePath` + review-economy import + cases for the 7 paths RED first; S2 (S) four schema patterns + tests; S3 (S) colon relaxation if decided; S4 (M) real-route walk test (preflight, bindings, register, compile, admit, finalize) and hint quoting review.
- PO DECISIONS: maximum length (lineage 512 bytes vs packet 240 UTF-16 units: a 300-byte path passes one and fails the other; align); leading dash (already allowed); trailing space or dot in a segment (`normalizePacketPath` refuses only whole-path leading/trailing whitespace); colon allowed or not; DEL and C1 controls; bidi override and other display-spoofing characters (legal in names).

## 4. Not reached / contradictions

- Staged production walk not run. Earliest known refusal is the lineage compile (`CRL-V2-PACKET` from `safePath`); behaviour of later steps with the fixed predicate is unknown. Blocked-by for the CLI step: `CDP-EVIDENCE-REQUIRED`, then budget.
- Briefing contradiction: Goal says notes only, no patch; DoD demands RED/GREEN cases in `critic-review-lineage.test.mjs`, a whole-file baseline/patched comparison and a clone2 apply check. Followed the Goal: no test change, no patch, no clone2 check.
- Clone, clone2 and fixture removed with `driver.mjs cleanup`.
