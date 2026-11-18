// SPDX-License-Identifier: SUL-1.0

/**
 * C30J-J22 (AC-112): one small renderer that shapes a command for the shell the human (or the agent's terminal) actually runs it in.
 *
 * Why: on a Windows host every path the Pipeline builds (`fileURLToPath`, `path.join`) carries backslashes, and the POSIX block of
 * the shared copy-safe rendering printed them as they came. A bash block with `C:\Users\...` is valid only through its quoting; a
 * chat, markdown or "!"-prefix layer that drops or re-wraps a backslash (a fragment ends in `\'`) tears the path apart. The forward
 * form `C:/Users/...` is valid in bash, PowerShell and node alike, so a bash block shows paths in that form.
 *
 * Only the DISPLAYED string changes. The argv a caller holds, `command`, every digest, subject and signature preimage stay exactly
 * as built; this module never hashes, signs or stores anything. Use it ONLY for a command whose path flags the receiving command resolves
 * (`--repo-root`, `--directory`): a command that compares a path flag byte-for-byte against the path it printed (`approve-push --proof-request`,
 * pipeline-state.mjs localMirrorScratchArtifacts) must keep the path exactly as built. Quoting and bounding stay the one definition in copy-safe-command.mjs.
 */
import { boundedCopySafeCommand, renderHumanCopySafeCommand } from "./copy-safe-command.mjs";

const DRIVE_PATH = /^[A-Za-z]:\\/u;
const UNC_PATH = /^\\\\[^\\/]/u;
const FLAG_WITH_VALUE = /^(--?[\w-]+=)(.+)$/su;

// Absolute paths only: a relative value (a stored path, a DOMAIN\user name) is never guessed to be a path.
function isWindowsPath(value) {
  return DRIVE_PATH.test(value) || UNC_PATH.test(value);
}

function toForwardSlashes(value) {
  if (typeof value !== "string") return value;
  if (isWindowsPath(value)) return value.replaceAll("\\", "/");
  const flag = FLAG_WITH_VALUE.exec(value);
  return flag !== null && isWindowsPath(flag[2]) ? `${flag[1]}${flag[2].replaceAll("\\", "/")}` : value;
}

/** The argv with every Windows-style path in forward-slash form; the SAME array when there is nothing to reshape. */
export function posixPathArgv(argv) {
  const shaped = argv.map(toForwardSlashes);
  return shaped.every((value, index) => value === argv[index]) ? argv : shaped;
}

/**
 * The line-break-safe string for ONE shell: the bounded bash (`CMD=` fragments, `eval "$CMD"`) or PowerShell block.
 * `pathStyle` "posix" shows Windows-style paths with forward slashes, "native" leaves them as built; the default is "posix" for bash
 * and "native" for PowerShell.
 */
export function renderHumanCommand({ executable, argv, shell, pathStyle } = {}) {
  if (shell !== "bash" && shell !== "powershell") throw new TypeError('renderHumanCommand shell must be "bash" or "powershell"');
  const style = pathStyle ?? (shell === "bash" ? "posix" : "native");
  if (style !== "posix" && style !== "native") throw new TypeError('renderHumanCommand pathStyle must be "posix" or "native"');
  const shaped = style === "posix" ? { executable: toForwardSlashes(executable), argv: posixPathArgv(argv) } : { executable, argv };
  const { copyCommand } = boundedCopySafeCommand({ ...shaped, forceCopyCommand: true });
  return shell === "bash" ? copyCommand.posix : copyCommand.powershell;
}

/**
 * The shared `renderHumanCopySafeCommand` result for a step whose reader's shell is unknown (both blocks are printed), with its POSIX
 * block shown in posix path style. Byte-identical to the shared rendering when no path needs reshaping.
 */
export function renderHumanStep({ label, executable, argv } = {}) {
  const original = renderHumanCopySafeCommand({ label, executable, argv });
  if (posixPathArgv(argv) === argv && toForwardSlashes(executable) === executable) return original;
  const posix = renderHumanCopySafeCommand({ label, executable: toForwardSlashes(executable), argv: posixPathArgv(argv), platform: "posix" });
  const copyCommand = { ...original.copyCommand, posix: renderHumanCommand({ executable, argv, shell: "bash" }) };
  return { ...original, copyCommand, text: `${posix.text}${original.text.slice(original.text.indexOf("\nPowerShell:\n"))}` };
}

/** The shared `boundedCopySafeCommand` result with only `copyCommand.posix` shown in posix path style (still null where the shared result has none); argv, command and the other blocks are untouched. */
export function boundedCopySafeCommandForBash({ executable, argv } = {}) {
  const original = boundedCopySafeCommand({ executable, argv });
  if (original.copyCommand.posix === null || (posixPathArgv(argv) === argv && toForwardSlashes(executable) === executable)) return original;
  return { ...original, copyCommand: { ...original.copyCommand, posix: renderHumanCommand({ executable, argv, shell: "bash" }) } };
}
