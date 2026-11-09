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

/**
 * F9 (candidate 19): a flag written with its value attached (`-A8`, `-m5`, `--max-count=5`) is refused by the grammar, which takes the value as a
 * separate argument. Returns one sentence naming the spelling to use, or null for any other flag. Prose only; it grants nothing.
 * @returns {string|null}
 */
export function flagSpellingHint(flag) {
  if (typeof flag !== "string") return null;
  const short = /^-([ABCm])(\d{1,4})$/u.exec(flag);
  if (short) return `an attached value is not admitted; give it as a separate argument: -${short[1]} ${short[2]}`;
  const long = /^(--[a-z][a-z-]*)=(.+)$/u.exec(flag);
  if (long) return `the "--flag=value" spelling is not admitted; give the value as a separate argument: ${long[1]} <value>`;
  return null;
}

/**
 * F9 (candidate 19): a short-flag cluster is refused where the same flags given one by one are admitted. C22B (2026-11-09): a cluster of boolean flags
 * (`rg -ln`) is now admitted by the grammar itself, so this hint fires only for a cluster that holds a flag taking a value (`rg -nA 5`, split `-n -A 5`).
 * The hint is printed only when the grammar itself admits the split spelling, so it is never a guess; it grants nothing.
 * @returns {string|null}
 */
export function clusterSpellingHint(command, flag, root) {
  if (typeof command !== "string" || typeof flag !== "string" || !/^-[A-Za-z]{2,}$/u.test(flag)) return null;
  let parsed;
  try { parsed = parseGuardCommand(command, root, { platform: "linux" }); } catch { return null; }
  if (parsed?.parseStatus !== "accepted" || parsed.segments.length !== 1
    || parsed.operators.length !== 0 || parsed.redirects.length !== 0) return null;
  if (isReadOnlyDiagnosticCommand(command, root)) return null; // C22B: an admitted cluster is no refusal, so it gets no hint
  const { executable, argv } = parsed.segments[0];
  const split = [...flag.slice(1)].map((letter) => `-${letter}`);
  const expanded = argv.flatMap((token) => (token === flag ? split : [token]));
  if (!isReadOnlyDiagnosticCommand([executable, ...expanded.map(quote)].join(" "), root)) return null;
  return `a combined short-flag cluster is not admitted here; give each flag on its own: ${split.join(" ")}`;
}

const NAMES_ONLY_LS_FLAGS = new Set(["-1", "-a", "-A"]);

/**
 * Q2 (candidate 19): a listing of a protected directory (the control root among them) is admitted as a names-only listing, so `ls -la <dir>` is
 * refused there while `ls -la docs` is not. The refusal names the flag, and the flag alone reads as an unsafe spelling; this adds the part the
 * flag cannot say: which spellings ARE admitted and how to list the same names another way. Returns one sentence for an `ls` command, else null.
 * Prose only; it grants nothing, the grammar (`isNamesOnlyLsArgs`) stays the single authority.
 * @returns {string|null}
 */
export function lsListingHint(command, flag, root) {
  if (typeof command !== "string" || typeof flag !== "string" || NAMES_ONLY_LS_FLAGS.has(flag)) return null;
  let parsed;
  try { parsed = parseGuardCommand(command, root, { platform: "linux" }); } catch { return null; }
  if (parsed?.parseStatus !== "accepted" || parsed.segments.length !== 1) return null;
  if (String(parsed.segments[0].executable).split("/").pop() !== "ls") return null;
  return "a protected directory, such as the control root, is listed as names only: `ls <dir>`, `ls -1 <dir>`, `ls -a <dir>` or `ls -A <dir>`; "
    + "`find <dir> -maxdepth 1` lists the same names; this is an intended read limit, not a fault of the directory";
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
    // C22B: a short-flag cluster that holds a value-taking flag (`-nA 5`) is refused although its flags spelled out are admitted. Removing the token cannot
    // show that (the value would be left behind), so replacing it by its single flags is the one extra probe; clusterSpellingHint then prints the spelling.
    if (/^-[A-Za-z]{2,}$/u.test(token)) {
      const split = argv.flatMap((word, position) => (position === index ? [...token.slice(1)].map((letter) => `-${letter}`) : [word]));
      if (isReadOnlyDiagnosticCommand([executable, ...split.map(quote)].join(" "), root)) return token;
    }
  }
  return null;
}
