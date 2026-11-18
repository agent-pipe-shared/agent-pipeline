# w30j18 — the generated briefing lists the admitted shell shapes, read from the guard's grammar exports (candidate 30j)

Applies AFTER the integrated 30i tree (the clone base9): it is a delta on that state and does not apply to the real checkout before it. Order: 30i tree, J18. `git apply --check` against the integrated 30i tree: exit 0.

## Recon (read-only)

- Consumer report: about 30 shell-guard refusals in the main run and about 70 in subagents (`GUARD-PARSE-UNSUPPORTED`, `GUARD-READ-COMMAND-UNSUPPORTED`, `GUARD-READ-TARGET`, `GUARD-READ-SCOPE-OUTSIDE-ROOT`); the admitted spellings were unknown beforehand.
- What the briefing said before: only "follow the obligations file, it carries the closed shell grammar" (the first line) and the stop condition "a guard refusal you cannot resolve with the admitted grammar". No grammar text in the briefing itself. `lib/dispatch-briefing-build.mjs` mentions `GUARD-READ-TARGET-MISSING` only in a comment.
- The grammar HAS a single exportable source: `lib/guard/grammar-denials.mjs` (a module with no imports) exports `ADMITTED_GRAMMAR_SHAPES` (the table the guard's own refusal renders and its test submits), `GRAMMAR_DENIAL_REMEDY` (the exact lines every grammar refusal prints, including the full shape list, `MAX_AND_CHAIN_SEGMENTS` and the `cd <dir> && node --test` alternative), `GRAMMAR_DENIAL_GUIDANCE`, `READ_COMMAND_UNSUPPORTED_CODE/GUIDANCE/NOTE`, `READ_SCOPE_DENIAL_CODE/GUIDANCE/REMEDY` and `READ_TARGET_EXACT_FILE_ADVICE`. So the recon did not trigger the stop condition.
- Obligations template section 1 states "no component exports the whole grammar as data". That is no longer true (the shape table is exported); the template text is generated and out of the write list, left as is (report only).
- The one gap: `GUARD-READ-TARGET` has no exported code constant. It is an inline literal at three sites (`lib/guard/read-scope.mjs` line 908, `lib/guard/powershell-dialect.mjs` line 195, `hooks/antigravity-pretool-guard.mjs` line 443); only its replacement text, `READ_TARGET_EXACT_FILE_ADVICE`, is exported. Smallest guard change wanted (guard file, NOT done here): `export const READ_TARGET_CODE = "GUARD-READ-TARGET";` in `grammar-denials.mjs`, used by the three sites; the briefing block could then name the code too. Until then the block leads that entry with the exported advice alone ("A refused native Read, Glob or Grep call (the guard prints this advice): ...") and the builder does not type the code name.

## What it changes

- `lib/dispatch-briefing-build.mjs`: new `admittedShellShapesBlock()` (pure, no input) renders ONE block from the guard's exports, and `renderGoldfishBriefing` places it once, right after the obligations sentence and before the binding block. The block holds the `GUARD-READ-COMMAND-UNSUPPORTED` guidance and note, the three grammar codes with their guidance, the exact lines every grammar refusal prints (one simple command per call, the `cd && node --test | tail` alternative, retry actions, the complete shape list with bounds: the bounded `rg|rg`, `rg|head|tail`, `grep|grep|head`, `cat|grep|head`, `git|head|tail` pipelines, the `&&` chain bound, the read, listing and context forms), the `GUARD-READ-SCOPE-OUTSIDE-ROOT` guidance with its five repair lines, and the exact-file advice for a native Read/Glob/Grep refusal.
- The block is part of the briefing body and therefore of the generator digest; no marker, digest or key byte logic changed.
- Test (`scripts/dispatch-briefing.test.mjs`, three new cases, RED before the change, GREEN after): (1) the heading, every `GRAMMAR_DENIAL_REMEDY` line, every shape spelling and example, every read-scope line, the note and the advice each appear exactly once, the three codes are named, the `&&` bound comes from the exported constant, the block precedes the six fields and the obligations sentence stays the first `Read` line; (2) two builds are byte-identical (text and sha256), `verifyGeneratedBriefing` passes, one changed block byte fails with `DBG-GENERATED-DIGEST-MISMATCH`, the host parser still reads the binding; (3) a source pin: the builder imports from `./guard/grammar-denials.mjs` and contains no shape spelling prefix, no example, no typed grammar code and no `GUARD-READ-TARGET` literal.

## Why

Reported consumer cost: each refusal spends a tool use from the budget that is also the stop condition. The briefing now carries what the refusal would print, before the first call. Criterion binding: AC-112 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## Checks (tests only; the Critic is suspended by the PO for candidates of this repository and no Full Verify ran)

- `scripts/dispatch-briefing.test.mjs`: 192 of 192 (the three new cases red first, then green).
- Pins that read the generated briefing: `lib/pins/goldfish-test-briefs-lack-targeted-and-quick-command-routes.test.mjs` 7 of 7; `lib/pins/acceptance-criteria-are-examined-as-whole-user-journeys.test.mjs` 10 of 10; `lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` 18 of 18.
- Check test of this patch: 2 of 2.

## Not changed

- No file under `lib/guard/` or `hooks/`; no refusal text; no record shape, digest or key byte; no gate, signature, approval, push approval, Critic evidence, security scan or audit bundle semantics; no stored status.
- The PowerShell shape table (`POWERSHELL_ADMITTED_SHAPES`) is deliberately not in the block: the Goldfish runs on Bash; only the Bash grammar is listed.
- The generated `templates/prompts/agent-obligations.md` and its generator: the stale "no component exports the whole grammar" sentence is reported only.
- Size: the block adds about 5 KB to a briefing, far below the 256 KiB briefing-file limit; no cap was touched.

## Not proven

- Integrated Verify and Critic review are pending (Coordinator). No real consumer run measured the drop in refusals; the effect is by construction (same text the refusal prints), not measured.
