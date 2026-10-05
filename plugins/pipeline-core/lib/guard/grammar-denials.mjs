// SPDX-License-Identifier: SUL-1.0
// Guard module "grammar-denials" (layer 0), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

// Hoisted to module scope so grammarOverrideRoute() can build the identical, exact
// denial reason text blocked() itself prints -- the two must never drift apart, since
// the HGO request/capability is bound to this exact reason string.
export const GRAMMAR_DENIAL_GUIDANCE = {
  "GUARD-PARSE-UNSUPPORTED": "The command is outside the closed Pipeline shell grammar.",
  "GUARD-OPERATOR-UNAPPROVED": "The command contains an unapproved shell operator.",
  "GUARD-REDIRECT-UNAPPROVED": "The command contains an unapproved shell redirection.",
};

/**
 * NVA-BL-76 (restored by NVA-B-READCONTAIN-1): the bounded read-only diagnostic pipeline
 * (rg-to-head / rg-to-rg) whose only unmet condition is that a read target resolves OUTSIDE
 * the project root. Before this code existed the same refusal was issued as
 * GUARD-OPERATOR-UNAPPROVED (or, with the admitted `2>/dev/null` suppressor,
 * GUARD-REDIRECT-UNAPPROVED) -- a reason that is false: the identical pipeline, identical
 * operator, is admitted one directory over, and the refusal's own closing line names bounded
 * rg-to-head as an admitted exception while refusing one.
 *
 * Deliberately NOT the cross-repository-mutation family: nothing here writes anywhere. It is
 * a narrower READ-scope refusal, and it is routed through humanOverrideRoute() exactly like
 * the grammar codes, so a human signature can authorize one exact outside-root read
 * (measured class `cross-repository-target` -- eligibility()'s generic out-of-root-argv
 * classification, reused here as-is; this read-scope code's own classification choice, not
 * an authority the mutation-specific ADR-0059 amendment that built that machinery ever
 * extended to reads). Distinguishing this from a write is the whole point of giving it its
 * own code: a signature that may authorize reading a background job's log outside the
 * checkout is not a signature that may authorize mutating another repository.
 */
// backlog/items/2026-08-19-closed-shell-grammar-still-rejects-common-readonly-composition.md
// Proposal point 1: a SMALL, explicit allowlist of read-only commands admitted when
// chained with `&&`. Deliberately bounded and small -- 6 segments comfortably covers the
// 4-segment triggering example with headroom, without becoming an unbounded chain. Declared
// here, ahead of ADMITTED_GRAMMAR_SHAPES below, because that table's array literal reads this
// constant at module-load time -- a `const` a few hundred lines further down would still be in
// its temporal dead zone at that point.
export const MAX_AND_CHAIN_SEGMENTS = 6;

export const READ_SCOPE_DENIAL_CODE = "GUARD-READ-SCOPE-OUTSIDE-ROOT";

export const READ_SCOPE_DENIAL_GUIDANCE = "The bounded read-only diagnostic pipeline reads a path outside the project root.";

// ALFRED-QP4 (backlog: read-scope false positives): GUARD-READ-SCOPE-OUTSIDE-ROOT used to be printed for EVERY single read-family command that
// was not admitted (isRejectedReadFamilyCommand), including commands whose only fault is a flag or spelling the closed grammar does not know
// (rg --no-heading, rg -m N, a repeated rg -g, git diff --output, a non-canonical double-quoted drive path ...) with every target inside the
// project. This code names that case truthfully. The scope code is now printed only when the command is admitted in every respect except that a
// read target resolves outside the project root (isOutsideRootSingleCommandRead, the same two-call pattern its siblings use). Both refuse.
export const READ_COMMAND_UNSUPPORTED_CODE = "GUARD-READ-COMMAND-UNSUPPORTED";

export const READ_COMMAND_UNSUPPORTED_GUIDANCE = "The read-only command is not supported by the closed Pipeline shell grammar (a flag, a repeated option or a spelling it does not admit).";

export const READ_COMMAND_UNSUPPORTED_NOTE = "This refuses the command's own flags or spelling, not a path: it is not reported as a read outside the project root. Re-spell it with the admitted grammar below, or use the Read, Glob or Grep tools for reads inside the project.";

// NVA-I-GRAMMAR (PO, 2026-08-28, backlog: 2026-08-27-shell-grammar-reads-quoted-content-as-
// shell-syntax.md): "wichtig ist, dass der guard das erlaubte grammar immer auch sagt" -- the
// refusal must state the COMPLETE admitted grammar with bounds and exact spellings, not just
// name the shapes. This is the single table the message below renders from AND the test suite
// (guard-lifecycle-ready.test.mjs) submits every `example` from, so the printed text can never
// drift from what is actually admitted -- the item's own complaint about the old fixed string
// ("grep-to-head" named with no bound, `head -N` omitted entirely). Every `example` here must
// be independently admitted by isReadOnlyDiagnosticCommand() on its own -- pinned by that same
// test, executing rather than merely matching each line.
export const ADMITTED_GRAMMAR_SHAPES = [
  {
    spelling: "one simple, un-piped read-only command (rg, grep, cat, head, tail, wc, stat, "
      + "file, sed [non-mutating], find [non-mutating], pwd, selected printf labels, git [read-only subcommands], and "
      + "a few narrow hash/check forms)",
    example: "rg -n needle probe.txt",
  },
  {
    spelling: "bounded rg-to-rg, rg-to-head, or rg-to-tail diagnostic pipeline: \"rg ... | rg ...\", "
      + "\"rg ... | head -n N\" / \"rg ... | head -N\", or \"rg ... | tail -n N\" / "
      + "\"rg ... | tail -N\" (N in 1..500), optionally followed by "
      + "\"2>/dev/null\"",
    example: "rg -n needle probe.txt | head -5",
  },
  {
    spelling: "bounded grep-to-grep or grep-to-head diagnostic pipeline: \"grep ... | grep ...\" "
      + "or \"grep ... | head -n N\" / \"grep ... | head -N\" (N in 1..500), optionally followed "
      + "by \"2>/dev/null\"",
    example: "grep -n needle probe.txt | head -5",
  },
  {
    spelling: "bounded cat-to-grep or cat-to-head diagnostic pipeline: \"cat <paths...> | "
      + "grep ...\" or \"cat <paths...> | head -n N\" / \"cat <paths...> | head -N\" "
      + "(N in 1..500), optionally followed by \"2>/dev/null\"",
    example: "cat probe.txt | head -5",
  },
  {
    spelling: "bounded git-to-head diagnostic pipeline: \"git <read-only-subcommand> ... | "
      + "head -n N\" / \"git <read-only-subcommand> ... | head -N\" (the same read-only "
      + "subcommand set the un-piped git form already trusts; N in 1..500), optionally "
      + "followed by \"2>/dev/null\"",
    example: "git log | head -5",
  },
  {
    spelling: `up to ${MAX_AND_CHAIN_SEGMENTS} "&&"-chained segments, admitted only when EVERY `
      + "segment is independently one of the shapes above or the small always-safe-write "
      + "allowlist (echo; \"mkdir -p\" under scratch/ or .claude/worktrees/)",
    example: "rg -n needle probe.txt && rg -n needle probe.txt",
  },
];

function grammarShapeLines() {
  return ADMITTED_GRAMMAR_SHAPES.map((shape) => `- ${shape.spelling} (e.g. "${shape.example}").`);
}

// The lines every grammar denial prints. Kept in one table so all three grammar codes stay
// byte-identical apart from their typed reason.
export const GRAMMAR_DENIAL_REMEDY = [
  "Use one simple shell command per tool call; issue independent read-only commands as separate parallel tool calls.",
  "Do not construct a new composed command with ;, pipelines, redirects, or line continuation outside the admitted shapes below.",
  "If typed retryActions are present, run only those exact read-only actions as separate tool calls.",
  "The complete admitted grammar, with bounds and exact spellings:",
  ...grammarShapeLines(),
];

// Restored by NVA-B-READCONTAIN-1 (pipeline.read-scope-single-command-root-check). Every line
// here is executable advice that actually clears THIS refusal: a single, un-piped read
// command is ALSO root-checked, so line 3 does not claim it is admitted "without a
// path-location restriction". Both remaining claims are pinned by the NVA-BL-76 tests, which
// EXECUTE the advice rather than matching its wording. This code never participates in the
// NVA-B-DENIALTRIM short-form trim below -- it prints the same three true lines every time.
export const READ_SCOPE_DENIAL_REMEDY = [
  "The pipeline is not the objection: the identical bounded rg-to-rg / rg-to-head / rg-to-tail pipeline is admitted when every read target resolves inside the project root.",
  "Recomposing the same read -- splitting it, adding operators, redirects or line continuation -- cannot lift this refusal.",
  "Re-target the read inside the project root: the identical bounded pipeline AND the identical single, un-piped read are both admitted once every read target resolves inside the project root.",
];

// NVA-B-DENIALTRIM: the trimmed rendering for the SECOND-OR-LATER denial of the SAME
// grammar-denial class (code) within one scope -- per resolved dispatched subagent, or per
// session_id absent one, NVA-B-TRIMKEY -- (blocked()'s `firstOccurrenceThisSession`
// parameter, backed by isFirstDenialThisScope() below). Deliberately still two full,
// actionable lines -- never a bare marker -- per AC-3: a denial that becomes unactionable is
// a regression, not a trim. Everything else the full form prints (the leading `${code}: ...`
// line, `Rejected element:`, `remediation`, the retryActions JSON envelope, and
// `overrideGuidance`) is unchanged and still printed in both forms; only this 9-line grammar
// listing shrinks to 2 lines.
export const GRAMMAR_DENIAL_REMEDY_SHORT = [
  "Use one simple shell command per tool call; no ;, pipelines, redirects, or line continuation outside the admitted grammar.",
  "The complete admitted grammar with exact spellings was already printed on the earlier denial of this kind this session; reuse one of the shapes shown there.",
];
