// SPDX-License-Identifier: SUL-1.0
// Test support for scripts/guard-human-override.test.mjs.
//
// E16 (specs/sprint-alfred-epic/plans/elephant-decisions-2026-10-19.md; d02409a8a): repair-audit confirms on the REAL fd 0
// (lib/chat-gate-ceremony.mjs), so the former `dependencies: { isattyFn, readLineFn }` seam is dead and no production seam is
// added. A CLI case whose claim IS the attended repair runs main() unchanged inside a child whose fd 0 is a real pty, with the
// typed line fed to it (the shape lib/human-guard-override.test.mjs uses for repairUnderPty). POSIX only; elsewhere
// PTY_HOST_LIMIT is a typed host-limit skip.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PTY_HOST_LIMIT = process.platform === "win32"
  ? "host-limit: native Windows has no pty in this suite, and the attended ceremony reads the real fd 0 by design (Elephant decision E16)"
  : (spawnSync("python3", ["-I", "-c", "import os, pty"], { encoding: "utf8" }).status === 0
    ? false
    : "host-limit: python3 with the pty module is unavailable, so no real pty can be allocated on this host (Elephant decision E16)");

const PTY_MAIN_DRIVER = [
  "import os, pty, sys",
  "typed = sys.argv[1].encode()",
  "pid, fd = pty.fork()",
  "if pid == 0:",
  "    os.execvp(sys.argv[2], sys.argv[2:])",
  "out = b''",
  "marker = b'Type the confirmation value'",
  "seen = True",
  "while marker not in out:",
  "    try:",
  "        chunk = os.read(fd, 4096)",
  "    except OSError:",
  "        chunk = b''",
  "    if not chunk:",
  "        seen = False",
  "        break",
  "    out += chunk",
  "if seen:",
  "    os.write(fd, typed + b'\\n')",
  "while True:",
  "    try:",
  "        chunk = os.read(fd, 4096)",
  "    except OSError:",
  "        break",
  "    if not chunk:",
  "        break",
  "    out += chunk",
  "os.waitpid(pid, 0)",
  "sys.stdout.write(out.decode('utf-8', 'replace'))",
].join("\n");

const PTY_MAIN_CHILD = [
  'import { writeFileSync } from "node:fs";',
  "const req = JSON.parse(process.env.HGO_CLI_REQUEST);",
  "const { main } = await import(req.mainUrl);",
  "let dependencies = {};",
  "if (req.lock) {",
  "  const { HumanGuardOverrideError } = await import(req.libUrl);",
  '  const refusal = new HumanGuardOverrideError("HGO-AUDIT-LOCK-AMBIGUOUS", req.message);',
  "  refusal.recovery = { files: [req.lock], command: `rm -- '${req.lock}'` };",
  "  dependencies = { afterTemporarySyncFn() { throw refusal; } };",
  "}",
  'let stdout = "", stderr = "";',
  "const status = main(req.argv, { write: (c) => { stdout += c; return true; }, writeError: (c) => { stderr += c; return true; } }, { dependencies });",
  "writeFileSync(req.resultPath, JSON.stringify({ status, stdout, stderr }));",
].join("\n");

/** Runs scripts/guard-human-override.mjs main(argv) under a real pty and feeds `typed` at the confirmation prompt.
 * With `lock`, the child makes afterTemporarySyncFn throw an HGO-AUDIT-LOCK-AMBIGUOUS refusal carrying that recovery.
 * Returns { status, stdout, stderr, tty } where tty is the complete terminal transcript. */
export function runMainUnderPty(argv, typed, { lock = null, message = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hgo-cli-pty-"));
  try {
    const resultPath = join(dir, "result.json");
    const req = { argv, lock, message, resultPath,
      mainUrl: new URL("../scripts/guard-human-override.mjs", import.meta.url).href,
      libUrl: new URL("./human-guard-override.mjs", import.meta.url).href };
    const run = spawnSync("python3", ["-I", "-c", PTY_MAIN_DRIVER, typed, process.execPath, "--input-type=module", "-e", PTY_MAIN_CHILD],
      { encoding: "utf8", timeout: 120_000, env: { ...process.env, HGO_CLI_REQUEST: JSON.stringify(req) } });
    let result;
    try { result = JSON.parse(readFileSync(resultPath, "utf8")); }
    catch { throw new Error(`pty child produced no result (exit ${run.status}): ${String(run.stdout).slice(-600)}${String(run.stderr).slice(-300)}`); }
    return { ...result, tty: String(run.stdout) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
