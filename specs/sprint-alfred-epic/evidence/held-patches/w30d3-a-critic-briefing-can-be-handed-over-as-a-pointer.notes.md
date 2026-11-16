# w30d3 — a Critic briefing is handed to the Critic as a verified pointer, not retyped (candidate 30d)

Applies AFTER the 30d chain (the patch is a delta on top of the chain's already delivered held patch, because it edits the same files, among them the model row's fill hint). Against the
repository without the chain it does not apply (`apply --check` exit 1 is expected there); against the chain clone it applies (`apply --check` exit 0). Criterion binding: AC-108 is the closest
existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

A Critic briefing is about 12k tokens and the Coordinator pasted it whole into the Agent prompt. A Goldfish briefing has had a two-line pointer since D183; the Critic now has the same route, with the same parser.

- `prepare-dispatch.mjs critic-fill --root <root> --briefing <draft> --fill NAME=value ...` (new verb, in `--help`). It reads one generated draft (`scratch/critic-briefing/<folder>/critic[-<part>].briefing.md`),
  fills its `<FILL NAME: hint>` slots from explicit values only, writes `critic[-<part>].final.md` BESIDE the draft (never over it) with a Critic generator marker whose sha256 covers every other byte,
  and prints `promptPointer`: the marker line plus one `pipeline-briefing-file: <path> sha256=<digest>` line.
  - Closed slot table (`lib/critic-briefing-build.mjs`, `fillCriticBriefing`): `MODEL_ID` is one token (letters, digits, dot, underscore, hyphen; never the word `inherit`), `EFFORT` is one of `low medium high xhigh max`.
    No slot takes free text; a value that cannot be written as such a token is refused. Bytes outside the slots are copied unchanged (the replacement is a function over the slot pattern only).
  - Refused with a code and nothing written: a value for a name that is no slot (`CBB-FILL-UNKNOWN-SLOT`), a slot left open (`CBB-FILL-OPEN-SLOT`), a value outside the vocabulary (`CBB-FILL-VALUE`), a draft with a Codex
    or Antigravity slot (`CBB-FILL-UNSUPPORTED-SLOT`, those carriers carry the full text), a draft that is marked, hand-edited into a placeholder, or not template-shaped (`CBB-FILL-SHAPE`), a draft path other than the generated one
    (`PREP-FILL-PATH`), a repeated or malformed `--fill` (`PREP-ARGUMENT`).
- The marker is `<!-- pipeline-critic-briefing-generator:v1 sha256=... -->`, the last line of the final file. It deliberately does not contain `<!-- pipeline-briefing-generator:`, the substring every Goldfish rule keys on, so the Goldfish
  marker, its verifier and its admission are unchanged and the marker says which generator wrote the file.
- `lib/briefing-file-reference.mjs`: `parseBriefingFileReference` returns `kind` (`goldfish` or `critic`); `loadReferencedBriefing` takes the dispatch's `subagentType`. A Critic marker is accepted only for `pipeline-core:critic`
  (else `DBG-REF-AMBIGUOUS`), only for a file in a folder under `scratch/critic-briefing/` (else `DBG-REF-PATH`), verifies marker, file digest and pointer digest (`DBG-REF-DIGEST`), refuses a file that still holds an open `<FILL` slot,
  and hands back the BODY WITHOUT its marker line. A pointer plus inline text, an edited file, a missing file and a Workflow/Codex/Antigravity carrier keep their existing codes (`DBG-REF-AMBIGUOUS`, `DBG-REF-DIGEST`, `DBG-REF-PATH`, `DBG-REF-CARRIER`).
- `hooks/guard-dispatch.mjs`: one changed argument (the role is passed to the loader). The D183 block already expands before every later consumer, so the dispatch policy findings, the template-shape check, the contamination
  check and the advisor-prohibition binding judge the EXPANDED text, byte-equal to an inline paste of the filled briefing (the case GD82 pins pointer and inline to the same exit, the same stderr and the same binding digest).
- Docs: the `critic` verb's `briefingUse` (Claude: the pointer route; Antigravity and Codex: full text), `--help`, `SKILL.md` (the Elephant's dispatch-admission part) and `critic-review.md` USAGE item 9 (above the copy marker, so never in the text the Critic receives; a test pins that the Critic's part has no pointer wording).

## Checks (run in the chain clone, one suite at a time)

- Written RED first against the unchanged code (5 + 3 + 5 new cases failed, `TypeError ... is not a function` / the usage text missing), then GREEN.
- `prepare-dispatch.test.mjs`: 35 of 35. `dispatch-briefing.test.mjs`: 188 of 188. `guard-dispatch.test.mjs`: 93 of 93 (QG-04: the corpus count 88 -> 93 is restated in place, the five new cases GD81-GD85 are the only change).
- `w30d3-...check.test.mjs`: the patch exists, touches only the nine briefed files, carries no absolute host path.

## Not changed / not proven

- The unfilled draft is not digest-bound (the generator writes it without a marker), so `critic-fill` stamps whatever draft it is given, as long as it is template-shaped and its slots are in the closed table. What protects the Critic is the guard,
  which judges the expanded text exactly as it judges an inline paste; the marker proves only that the final file was not changed after the fill step.
- The repo-root copy `templates/prompts/critic-review.md` is NOT in this patch (outside the briefed file list) and is byte-identical to the plugin copy today; `check-vendored-template-sync` will report the pair out of sync until the same
  hunk (USAGE item 9) is applied to the root copy. The vendored copy is the one the patch edits.
- `lib/dispatch-briefing-build.mjs` (the Goldfish generator) is untouched; no export was needed.
- No end-to-end Claude run with a real Agent call was made; the guard is exercised through its real hook process in the test, not through the Claude runtime. The full Verify was not run. Critic review and PO acceptance are pending.
- The DoD line "the patch applies to the real HEAD" contradicts the chain-slice fact (a delta on the 30d chain); the check test does not run `git apply` and this note states the order instead.
