// SPDX-License-Identifier: SUL-1.0
/**
 * NVA-INTAKEARGV-1: the single declaration of the argv shape every mutating onboarding
 * subcommand accepts, plus the two renderers built from it.
 *
 * History, because it explains why this lives in `lib/` rather than staying in
 * `scripts/project-onboarding-v3.mjs` where NVA-CODEXARGV-1 first centralised it. That
 * pass closed the drift between the CLI's emitted argv and guard-lifecycle-ready.mjs's
 * admission -- two machine components -- and pinned it with a test that fed one into the
 * other. It did NOT reach the third consumer: the `nextAction.guidance` string that
 * `lib/project-onboarding-v3.mjs` hands the agent, which is the only one of the three an
 * agent actually reads. That string was hand-written prose and named no `--activate`,
 * while every one of these shapes requires it. Measured consequence, 2026-08-27: a Codex
 * greenfield session followed the guidance exactly, the guard refused the result as
 * `GUARD-LIFECYCLE-NOT-READY`, the guard's own recovery pointed back at the inspection
 * that produced the same guidance again, and onboarding could not be completed at all.
 * `scripts/` cannot be the home for the declaration because `scripts/project-onboarding-
 * v3.mjs` imports `lib/project-onboarding-v3.mjs`, so the guidance side importing back
 * would be a cycle.
 *
 *   required            -- flags that consume only themselves and MUST be present.
 *   requiredValue       -- flags that consume themselves plus one value and MUST be present.
 *   requiredValueOneOf  -- value flags of which EXACTLY ONE must be present.
 *   optionalValue       -- flags that consume themselves plus one value and MAY be present.
 *
 * `--root` is always requiredValue and is always validated against the caller's own
 * resolved root, so it never needs a separate value-shape declaration here.
 *
 * Per-flag VALUE validation deliberately stays guard-side (is this a real hex digest, a
 * real language code, a real project root): what this table closes is drift in the flag
 * SET, not a second copy of the validators.
 */

export const MUTATING_ONBOARDING_ARGV_SHAPES = Object.freeze({
  // NVA-V10B-INTAKEONEROUND: `--text`/`--text-file` are additionally admitted here, both
  // individually optional (never `requiredValueOneOf` -- that shape demands exactly one be
  // PRESENT, which is wrong for a flag pair that may legitimately be omitted entirely on this
  // command). A PO who answers the consent/identity questions AND supplies their first chunk of
  // project material in the same reply can have both recorded by this ONE call instead of two;
  // omitting both leaves behaviour identical to before this change. Supplying both --text and
  // --text-file at once is a caller error exactly as it is for intake-capture-apply, but that
  // rejection is enforced CLI-side (resolveIntakeCaptureText() in
  // scripts/project-onboarding-v3.mjs) rather than by this table: `optionalValue` has no
  // cross-flag "at most one" concept, so the guard admits the flag SET and nothing wider than
  // that -- it does not, and structurally cannot, also enforce the pairwise exclusion.
  "intake-consent-apply": Object.freeze({
    required: Object.freeze(["--granted", "--activate"]),
    requiredValue: Object.freeze(["--root"]),
    requiredValueOneOf: Object.freeze([]),
    optionalValue: Object.freeze(["--git-author-name", "--git-author-email", "--language", "--profile", "--text", "--text-file"]),
  }),
  // NVA-INTAKEARGV-1: `--text-file` is not a convenience alias. The captured value is the
  // PO's own material design input -- `intakeCaptureAction()` declares it `singleLine:
  // false`, "genuinely multi-line prose" -- and the closed Pipeline shell grammar refuses
  // any command text containing a newline (`GUARD-PARSE-UNSUPPORTED`). With `--text` as the
  // only route, a real design document was structurally unpassable: the one input the whole
  // intake exists to collect could never reach it. The file route mirrors the one
  // `resume-hint.mjs capture --card-file` already uses for the same reason.
  "intake-capture-apply": Object.freeze({
    required: Object.freeze(["--activate"]),
    requiredValue: Object.freeze(["--root"]),
    requiredValueOneOf: Object.freeze(["--text", "--text-file"]),
    optionalValue: Object.freeze([]),
  }),
  "intake-design-questions-apply": Object.freeze({
    required: Object.freeze(["--activate"]),
    requiredValue: Object.freeze(["--root", "--answers-json"]),
    requiredValueOneOf: Object.freeze([]),
    optionalValue: Object.freeze([]),
  }),
  "intake-generate-apply": Object.freeze({
    required: Object.freeze(["--activate"]),
    requiredValue: Object.freeze(["--root", "--plan-sha256"]),
    requiredValueOneOf: Object.freeze([]),
    optionalValue: Object.freeze([]),
  }),
  "bootstrap-bind-apply": Object.freeze({
    required: Object.freeze(["--activate"]),
    requiredValue: Object.freeze(["--root", "--plan-sha256"]),
    requiredValueOneOf: Object.freeze([]),
    optionalValue: Object.freeze([]),
  }),
});

/**
 * Build the exact automated apply argv for one declared subcommand. Every required flag
 * (boolean or value) is always emitted; a one-of flag is emitted when `values` carries it,
 * and exactly one of the alternatives must be supplied; an optional value flag is emitted
 * only when present. Nothing outside the declared shape can ever be emitted, structurally
 * rather than by discipline, because the loops below only read flag names off the table.
 * `values` is keyed by the flag's own literal name (e.g. `"--plan-sha256"`). Throws on an
 * unknown subcommand, a missing required value, or a one-of group not satisfied by exactly
 * one alternative -- all caller bugs, never a shape to silently paper over.
 */
export function automatedMutatingApplyArgv(name, root, values = {}) {
  const shape = MUTATING_ONBOARDING_ARGV_SHAPES[name];
  if (!shape) throw new TypeError(`${name} has no declared mutating apply argv shape`);
  const argv = [name];
  for (const flag of shape.requiredValue) {
    const value = flag === "--root" ? root : values[flag];
    if (value === undefined) throw new TypeError(`${name} requires ${flag}`);
    argv.push(flag, value);
  }
  const oneOf = shape.requiredValueOneOf ?? [];
  if (oneOf.length > 0) {
    const supplied = oneOf.filter((flag) => values[flag] !== undefined);
    if (supplied.length !== 1) {
      throw new TypeError(`${name} requires exactly one of ${oneOf.join(", ")}`);
    }
    argv.push(supplied[0], values[supplied[0]]);
  }
  for (const flag of shape.optionalValue) {
    if (values[flag] !== undefined) argv.push(flag, values[flag]);
  }
  for (const flag of shape.required) argv.push(flag);
  return argv;
}

/**
 * NVA-INTAKEARGV-1: render one subcommand's admitted form as the human/agent-facing command
 * hint embedded in a `nextAction.guidance` string. Derived from the same table the CLI emits
 * from and the guard admits by, so a guidance string can no longer describe a command the
 * guard refuses -- the exact failure this module was created for. Placeholders are the flag's
 * own name in angle brackets unless `placeholders` names one.
 */
export function mutatingApplyCommandHint(name, placeholders = {}) {
  const shape = MUTATING_ONBOARDING_ARGV_SHAPES[name];
  if (!shape) throw new TypeError(`${name} has no declared mutating apply argv shape`);
  const slot = (flag) => placeholders[flag] ?? `<${flag.replace(/^--/u, "")}>`;
  const parts = [name];
  for (const flag of shape.requiredValue) parts.push(`${flag} ${slot(flag)}`);
  const oneOf = shape.requiredValueOneOf ?? [];
  if (oneOf.length > 0) parts.push(oneOf.map((flag) => `${flag} ${slot(flag)}`).join(" | "));
  for (const flag of shape.optionalValue) parts.push(`[${flag} ${slot(flag)}]`);
  for (const flag of shape.required) parts.push(flag);
  return parts.join(" ");
}
