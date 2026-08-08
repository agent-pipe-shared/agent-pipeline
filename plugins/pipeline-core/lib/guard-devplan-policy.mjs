// SPDX-License-Identifier: SUL-1.0
/**
 * The dev-plan gate's exempt write prefixes, in a module a reader can import.
 *
 * `guard-devplan.mjs` is a hook SCRIPT: it runs its whole decision at import
 * time and calls `process.exit()`. Anything that merely wants to *know* its
 * policy therefore cannot import it — the importing process dies. Before this
 * module the only way to state the list elsewhere was to type it out again, and
 * a hand-copied second copy of a rule a guard owns is precisely the drift this
 * repository has been bitten by twice in one block.
 *
 * So the value lives here, with exactly one owner: the guard imports it to
 * enforce, and the obligations generator (a source-checkout tool, so its path is
 * deliberately not named here -- a shipped file must not point a consumer at
 * something only this repository has) imports it to tell agents about it. A
 * prefix added here reaches both at once, and the generator's contract test goes
 * red until the shipped document is regenerated.
 */

/**
 * Why `scratch/` is here, and why it is the safest of the five rather than the
 * riskiest (kept with the value it explains):
 *
 * The Pipeline's own shipped instructions send every agent to `scratch/` and
 * describe it as the one place needing no exception —
 * `skills/pipeline-start/SKILL.md` calls it "the only location the containment
 * guard permits without an exception", and the Goldfish briefing template says
 * the same. Both were speaking about the CONTAINMENT guard
 * (`guard-lifecycle-ready`), which does permit it, while this gate blocked it in
 * the `draft` phase — the phase every fresh project starts in. A consumer
 * following the shipped instruction was refused by a guard the instruction had
 * never cleared, and pointed at a plan approval that has nothing to do with
 * writing a throwaway probe script.
 *
 * `docs/`, `specs/`, `.claude/` and `backlog/` are tracked directories whose
 * contents ship; `scratch/` holds throwaways by definition. Implementation
 * smuggled there is not implementation until it moves into a real source path,
 * and that move is exactly what this gate still catches.
 *
 * backlog: 2026-08-08-shipped-guidance-sends-agents-to-a-directory-a-gate-refuses.md
 */
export const DEFAULT_EXEMPT_PREFIXES = Object.freeze(["docs/", "specs/", ".claude/", "backlog/", "scratch/"]);
