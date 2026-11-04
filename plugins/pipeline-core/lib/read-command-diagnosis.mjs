// SPDX-License-Identifier: SUL-1.0
/**
 * Names the one flag that makes a single read-family command fall outside the closed shell grammar.
 *
 * Backlog item pipeline.advertised-git-to-head-pipeline-is-refused (2026-10-18 addendum): the refusal of a single
 * read command ("a flag, a repeated option or a spelling it does not admit") did not say WHICH token it objected to,
 * so an agent re-spelled blindly and spent tool uses. This helper asks the grammar itself, never a second copy of it:
 * a flag is the culprit when removing that one token makes the grammar admit the command. It reports nothing when no single removal is enough (two bad flags, a bad operand, a pipeline) --
 * a diagnosis that may be wrong is worse than none.
 *
 * Pure and read-only: it parses and re-asks `isReadOnlyDiagnosticCommand`, it grants nothing.
 */
import { parseGuardCommand } from "../hooks/guard-command-grammar.mjs";
import { isReadOnlyDiagnosticCommand } from "./guard/shell-grammar.mjs";

const quote = (word) => `'${String(word).replaceAll("'", "'\\''")}'`;

/**
 * F9 (candidate 19): the filename-filter forms the grammar admits for `rg -g`/`--glob`, as one sentence the refusal prints. It is
 * prose only; the grammar (`isBoundedFilenameFilter`) stays the single authority, and the helper below asks it rather than copying it.
 */
export const GLOB_FORM_HINT = "a filename filter admits only `*.ext`, `*.test.ext`, `**/*.ext` or a multi-dot extension such as `*.d.ts`; "
  + "to select files by name, list them with `rg --files <dir>` and narrow with `| rg <name>`";

/**
 * Names an `rg` glob value that is the whole reason a single read command falls outside the grammar: the command is refused as written
 * and admitted once that one value is replaced by an admitted form. Same contract as firstUnadmittedFlag: one segment, no pipeline,
 * no redirect, nothing granted, null whenever the diagnosis could be wrong.
 * @returns {string|null} the glob value (as written), else null.
 */
export function firstUnadmittedGlobValue(command, root) {
  if (typeof command !== "string" || command.trim() === "") return null;
  let parsed;
  try { parsed = parseGuardCommand(command, root, { platform: "linux" }); } catch { return null; }
  if (parsed?.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return null;
  const { executable, argv } = parsed.segments[0];
  if (String(executable).split("/").pop() !== "rg") return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  const endOfOptions = argv.indexOf("--");
  const limit = endOfOptions === -1 ? argv.length : endOfOptions;
  for (let index = 0; index < limit - 1; index += 1) {
    if (argv[index] !== "-g" && argv[index] !== "--glob") continue;
    const value = argv[index + 1];
    if (typeof value !== "string" || value === "") continue;
    const swapped = argv.map((token, position) => (position === index + 1 ? "*.md" : token));
    if (isReadOnlyDiagnosticCommand([executable, ...swapped.map(quote)].join(" "), root)) return value;
  }
  return null;
}

/** @returns {string|null} the flag token (as written) whose removal makes the command admitted, else null. */
export function firstUnadmittedFlag(command, root) {
  if (typeof command !== "string" || command.trim() === "") return null;
  let parsed;
  try { parsed = parseGuardCommand(command, root, { platform: "linux" }); } catch { return null; }
  if (parsed?.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null;
  const { executable, argv } = parsed.segments[0];
  const endOfOptions = argv.indexOf("--");
  const limit = endOfOptions === -1 ? argv.length : endOfOptions;
  for (let index = 0; index < limit; index += 1) {
    const token = argv[index];
    if (typeof token !== "string" || !token.startsWith("-") || token === "-") continue;
    // Single-token removal only. Dropping the following token as well (a flag's value) would let a bad operand or the
    // pattern itself vanish and be mistaken for a flag fault, so a bad value flag is simply not diagnosed (null).
    const rest = argv.filter((_, position) => position !== index);
    if (isReadOnlyDiagnosticCommand([executable, ...rest.map(quote)].join(" "), root)) return token;
  }
  return null;
}
