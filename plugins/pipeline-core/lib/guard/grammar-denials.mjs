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

export const READ_COMMAND_UNSUPPORTED_NOTE = "This refuses the command's own flags or spelling, not a path: it is not reported as a read outside the project root. Re-spell it with the admitted grammar below; where the runner offers native Read, Glob or Grep tools, those cover reads inside the project.";

// K96 (PO decision 2026-10-23, rows 6/16, M7 and M5): a read whose TARGET is a protected credential location has its own typed code. Before
// it, an in-root credential read (`cat vault/id_rsa`) was labelled GUARD-READ-COMMAND-UNSUPPORTED and told the agent that the refusal "is about
// flags or spelling, not a path" -- false, the path is the whole cause. The code names the path as the cause and states a repair that can
// be run: the human puts the content into a non-credential file, or releases the exact read by a signed one-time override where the planner
// offers a route. Family: GUARD-READ-*, next to GUARD-READ-SCOPE-OUTSIDE-ROOT, GUARD-READ-COMMAND-UNSUPPORTED and GUARD-READ-TARGET.
export const READ_CREDENTIAL_TARGET_CODE = "GUARD-READ-CREDENTIAL-TARGET";

export const READ_CREDENTIAL_TARGET_GUIDANCE = "The read target is a protected credential location (a private key, token, credentials or secret-named file).";

const READ_CREDENTIAL_TARGET_CAUSE = "This refusal is about the path: no change to the command, its options or its wording can lift it.";
const READ_CREDENTIAL_TARGET_COPY_REPAIR = "Repair: ask the human to put the content you need into a non-credential file inside the project (for example under docs/ or scratch/), then read that copy.";

/** Shell lane: the repair lines of the typed refusal. The exact override route (or the statement that none is offered) follows them. */
export const READ_CREDENTIAL_TARGET_REMEDY = [
  READ_CREDENTIAL_TARGET_CAUSE,
  READ_CREDENTIAL_TARGET_COPY_REPAIR,
  "Alternatively the human can release this one exact read with a signed one-time override; the route is printed below when the override planner offers one for this path, and when it reports that none is offered, the copy above is the repair.",
];

/** Native read tools (no shell command, no override route for a native tool call): the same cause and the same runnable repair. */
export const READ_CREDENTIAL_TARGET_REMEDY_NATIVE = [
  READ_CREDENTIAL_TARGET_CAUSE,
  READ_CREDENTIAL_TARGET_COPY_REPAIR,
  "A signed override is a shell-command route only; a native read tool has none, so the copy above is the repair for this tool.",
];

/** The agent-visible text of the typed refusal for a native read tool (the shell lane renders through blocked()). */
export function nativeReadCredentialTargetDenialText() {
  return "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
    + `${READ_CREDENTIAL_TARGET_CODE}: ${READ_CREDENTIAL_TARGET_GUIDANCE}\n`
    + READ_CREDENTIAL_TARGET_REMEDY_NATIVE.map((line) => `${line}\n`).join("");
}

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
    spelling: "bounded git-to-head (or git-to-tail) diagnostic pipeline: \"git <read-only-subcommand> ... | "
      + "head -n N\" / \"git <read-only-subcommand> ... | head -N\", or the same with \"tail -n N\" / "
      + "\"tail -N\" (the same read-only "
      + "subcommand set the un-piped git form already trusts; N in 1..500), optionally "
      + "followed by \"2>/dev/null\"",
    example: "git log | head -5",
  },
  {
    spelling: `up to ${MAX_AND_CHAIN_SEGMENTS} "&&"-chained segments, admitted only when EVERY `
      + "segment is independently one of the shapes above or the small always-safe-write "
      + "allowlist (echo; \"mkdir -p\" under scratch/ or .claude/worktrees/; \"cd\" to the absolute project root)",
    example: "rg -n needle probe.txt && rg -n needle probe.txt",
  },
  {
    // C21 (AC-108): the listing and context forms a worker tries first; the paths are judged by the same scope as every other read.
    spelling: "listing and context forms of those commands: \"rg --files <dir>...\"; a context flag \"-A N\" / \"-B N\" / \"-C N\" (grep: N of 1..3 digits, separate or attached "
      + "as -C5; rg: N up to 500, separate or attached as -C5);\"ls\" with -l -a -R -1 -h (or combined, e.g. -la) over contained paths; listing a directory the project has yet to create is admitted; "
      + "rg and grep also take a combined cluster of flags that are each admitted on their own and take no value (e.g. -in); a flag with a value, such as -A or -m, stays separate; "
      + "\"grep -rn <pattern> <dir>\" (also -rl, -ril, --include=GLOB, --exclude=GLOB) reads every file under the directory, hidden and ignored ones too, so it is admitted only when the tree holds no secret-named file and no .git "
      + "(add --exclude-dir=.git, at most 8 --exclude-dir=NAME) -- otherwise use \"rg -n <pattern> <dir>\"; -R is not admitted",
    example: "grep -n -C 5 needle probe.txt",
  },
  {
    // Codex greenfield 2026-11-08: a regular expression ending in $ inside double quotes was refused with no hint why.
    spelling: "a search pattern holding a dollar sign or a backtick stands in single quotes, since double quotes would let the shell expand it",
    example: "rg -n 'needle$' probe.txt",
  },
];

function grammarShapeLines() {
  return ADMITTED_GRAMMAR_SHAPES.map((shape) => `- ${shape.spelling} (e.g. "${shape.example}").`);
}

// C18-8 (AC-239): the shape `cd <dir> && node --test <file> | tail -N` cost a consumer run several retries because the refusal named no working
// alternative. The alternative is a test run as its own tool call from the project root; this example is pinned by g23-read-help.test.mjs to be
// admitted by the guard itself.
export const GRAMMAR_CD_TEST_ALTERNATIVE_EXAMPLE = "node --test plugins/pipeline-core/lib/git-cmd.test.mjs";

// C18-8 (AC-239): one working example per PowerShell shape GUARD-POWERSHELL-GRAMMAR refuses; each is pinned by g23-read-help.test.mjs to be admitted.
export const POWERSHELL_GRAMMAR_EXAMPLES = {
  literal: "Get-Content docs/a.md",
  newItem: "New-Item -Path scratch/work -ItemType Directory",
  contentWrite: "Set-Content -LiteralPath scratch/note.txt -Value 'text'",
  read: "Get-Content -LiteralPath docs/a.md",
};

// C19C-W169 (E7 PowerShell part): the forms the PowerShell dialect admits, as ONE table. Every GUARD-POWERSHELL-GRAMMAR refusal renders it (the refused
// shape's alternative is always on the page) and powershell-bash-guard-parity.test.mjs submits every example, so the printed text cannot drift from what is
// admitted. `<plugin-root>` is replaced by the guard's own plugin root when the text is rendered. The git row is the read-only subcommand set of the Bash
// grammar (isReadOnlyDiagnosticCommand answers for it), not a second list.
export const POWERSHELL_ADMITTED_SHAPES = [
  { spelling: "one literal read of one contained path (Get-Content, Get-ChildItem, Get-Item, Test-Path)", example: POWERSHELL_GRAMMAR_EXAMPLES.literal },
  { spelling: "New-Item for a scratch file or directory", example: POWERSHELL_GRAMMAR_EXAMPLES.newItem },
  { spelling: "Set-Content or Add-Content for a scratch file", example: POWERSHELL_GRAMMAR_EXAMPLES.contentWrite },
  { spelling: "a read-only git observation: the same read-only subcommands the Bash grammar admits (status, log, diff, show, rev-parse, ls-files, ...); never commit, push, add, reset or checkout",
    example: "git status --short" },
  { spelling: "the version probes `node --version`, `node -v` and `git --version`, and a read-only `rg` search with the same rules as the Bash grammar (no quote, comma, parenthesis or brace in an argument); shell builtins and aliases such as cat, ls and find are not admitted in PowerShell",
    example: "node --version" },
  { spelling: "a sanctioned Pipeline script exactly as the bootstrap or `pipeline-state.mjs inspect` prints it",
    example: "node \"<plugin-root>/scripts/pipeline-state.mjs\" inspect" },
  { spelling: "`--help` of a sanctioned Pipeline script, and in a ready session the read-only plan, inspect and binding verbs (continuity-authority-revision-plan, continuity-result-bootstrap-plan, dispatch-briefing binding)",
    example: "node \"<plugin-root>/scripts/pipeline-state.mjs\" continuity-authority-revision-plan --help" },
  { spelling: "one literal `$env:PIPELINE_PLUGIN_ROOT = \"<plugin-root>\"` assignment (this plugin's root only), folded into the single command after the `;`",
    example: "$env:PIPELINE_PLUGIN_ROOT = \"<plugin-root>\"; node \"$env:PIPELINE_PLUGIN_ROOT/scripts/pipeline-start-preflight.mjs\"" },
];

// C18-8 (AC-239): GUARD-READ-TARGET for a native read tool (not a credential target) -- what a permitted read of a plugin file looks like.
export const READ_TARGET_EXACT_FILE_ADVICE = "Name one exact file path, without a wildcard: use the Read tool with file_path set to that file "
  + "(plugin files are read this way, e.g. file_path <plugin root>/scripts/example.mjs), or Grep with path set to that one file. "
  + "A glob pattern (Glob, or a Grep glob over a directory of plugin files) is not admitted; list the plugin directory by exact path and read each file you need.";

// The lines every grammar denial prints. Kept in one table so all three grammar codes stay
// byte-identical apart from their typed reason.
export const GRAMMAR_DENIAL_REMEDY = [
  "Use one simple shell command per tool call; issue independent read-only commands as separate parallel tool calls.",
  `A shape such as "cd <dir> && node --test <file> | tail -N" is not admitted (a directory change and a piped test run); run the test as its own tool call from the project root, the path relative to it, e.g. "${GRAMMAR_CD_TEST_ALTERNATIVE_EXAMPLE}".`,
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
  // Q2 (candidate 19): the refusal is intended; say so and name the one alternative that exists besides re-targeting.
  "This refusal is intended, not a fault of the command: shell reads are kept inside the project root. For one exact file outside the root, the native Read tool with that file path is the alternative; it applies its own read-scope rules.",
  // C23 (AC-108): a read is never offered a human override, so the text names what is admitted instead of a ceremony.
  "A read needs no human override and none is offered. Admitted instead: shell reads of files inside the project root and of the Pipeline plugin's own files, and the native Read tool for one exact file elsewhere.",
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
