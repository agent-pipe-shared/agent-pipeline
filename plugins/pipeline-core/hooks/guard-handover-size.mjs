#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * guard-handover-size.mjs -- ADR-0066 Decision 3(b)/4: a PreToolUse hard
 * size gate on the project's configured handover file (default
 * `docs/state.md`, a calibrated utf8-byte-upper-bound cap -- see
 * `lib/handover-rotation.mjs`'s `HANDOVER_MAX_BYTES`, overridable
 * per-project via a `handover.maxBytes` calibration key), independent of
 * any close event. NVA-HANDOVER-ROT-1 Piece C. Also fulfills the parallel
 * requirement from ADR-0073 Decision 1(b) ("an independent hard size
 * gate") -- both ADRs converge on the same guard; this implementation is
 * the one both merge sides settled on, per PHX-MERGE-1A-HANDOVERSIZE's own
 * conflict-resolution finding (Nova's proposed-post-write-size simulation
 * is the only one of the two independently-authored implementations that
 * actually satisfies Decision 3(b)'s "a proposed write that is NOT a
 * decrease and would leave the file at or over the cap is refused" --
 * the Phoenix-line alternative checked only the pre-write on-disk size,
 * so it never caught the crossing edit itself).
 *
 * Registered in `hooks.json` as a PreToolUse hook on the `Edit|Write|
 * NotebookEdit` matcher (see the `guard-handover-size.mjs` entry there) --
 * this guard is live on every Edit/Write/NotebookEdit call in this
 * repository, not merely built and awaiting wiring.
 *
 * Mirrors `guard-lifecycle-ready.mjs`'s PreToolUse input contract (stdin
 * JSON carrying `tool_name`/`tool_input`) and exit-code convention (0
 * allow, 2 block) -- deliberately WITHOUT importing anything from that
 * file, per this dispatch's briefing (mirror the shape, not the module).
 * `writeTargetPath()` (`lib/tool-write-target.mjs`) is imported directly
 * from its own owning module, which `guard-lifecycle-ready.mjs` itself
 * also imports from -- reusing the shared utility is not importing from
 * the guard file it is mirrored against.
 *
 * Inert (verdict 0) for every write that is not to the configured handover
 * path -- the overwhelming common case. For the handover path itself: a
 * proposed write that is a net size DECREASE is always admitted (a
 * rotation must never be blocked by the cap it exists to enforce, ADR-0066
 * Decision 3(b)/Consequences). A proposed write that is NOT a decrease and
 * would leave the file at or over the cap is refused with a typed code
 * naming the current size, the cap, and the rotation script's path.
 * Below cap and not a decrease: admitted, today's behaviour unaffected.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HANDOVER_MEASUREMENT_SCHEMA, resolveHandoverConfig } from "../lib/handover-rotation.mjs";
import { writeTargetPath } from "../lib/tool-write-target.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

const WRITE_TOOLS = ["Edit", "Write", "NotebookEdit"];
export const DENIAL_CODE = "HANDOVER-ROTATION-REQUIRED";
const DEFAULT_ROTATE_SCRIPT_PATH = fileURLToPath(new URL("../scripts/handover-rotate.mjs", import.meta.url));

function verdict(exitCode, stderr = "") {
  return { exitCode, stderr };
}

function blocked({ currentBytes, maxBytes, proposedBytes, handoverPath, rotateScriptPath }) {
  return verdict(
    2,
    "BLOCKED (guard-handover-size, plugin pipeline-core): "
      + `${DENIAL_CODE}: the handover file \`${handoverPath}\` is at or over its hard size cap and this write is not a net decrease.\n`
      + `Current size: ${currentBytes} bytes (utf8-byte-upper-bound, schema ${HANDOVER_MEASUREMENT_SCHEMA}). Cap: ${maxBytes} bytes. Proposed size: ${proposedBytes} bytes.\n`
      + `Rotate closed content out first: node "${rotateScriptPath}" --root <repository-root> --section-heading "<block heading>" --summary "<one-line summary>".\n`
      + "A write that is itself a net size decrease -- including the rotation script's own live-file rewrite -- is always admitted, never blocked by this cap.\n",
  );
}

/**
 * Computes the proposed post-write UTF-8 byte length of a write-shaped tool
 * call against the handover file's CURRENT on-disk content. Returns `null`
 * when the shape cannot be determined -- callers fail OPEN on `null` (admit),
 * matching this guard family's stated fail-open-by-design posture: a shape
 * this guard cannot read is not evidence the write is unsafe.
 */
export function proposedHandoverBytes(input, currentContent) {
  const toolName = String(input?.tool_name ?? "");
  const toolInput = input?.tool_input;
  if (toolInput === null || typeof toolInput !== "object") return null;

  if (toolName === "Write") {
    if (typeof toolInput.content !== "string") return null;
    return Buffer.byteLength(toolInput.content, "utf8");
  }

  if (toolName === "Edit") {
    if (typeof toolInput.old_string !== "string" || typeof toolInput.new_string !== "string") return null;
    let next;
    if (toolInput.replace_all === true) {
      next = currentContent.split(toolInput.old_string).join(toolInput.new_string);
    } else {
      // NVA-HANDOVER-ROT-2 F2: literal single-occurrence replacement computed by hand -- NEVER
      // via String.prototype.replace(), whose replacement-string argument interprets $&, $`, $',
      // $$ (and $<name>) as special patterns even when the search pattern is a plain string. A
      // new_string containing one of those sequences would otherwise inflate the simulated
      // post-write size and could misclassify a genuinely shrinking rotation edit as growing.
      const matchIndex = currentContent.indexOf(toolInput.old_string);
      next = matchIndex === -1
        ? currentContent
        : currentContent.slice(0, matchIndex) + toolInput.new_string + currentContent.slice(matchIndex + toolInput.old_string.length);
    }
    return Buffer.byteLength(next, "utf8");
  }

  if (toolName === "NotebookEdit") {
    // A notebook cell edit does not carry the whole file's prospective content the way
    // Write/Edit do, and simulating the exact post-write JSON byte length would require
    // parsing and re-serializing the notebook's own on-disk structure -- out of this
    // guard's scope, and the handover file is realistically never a `.ipynb`. Conservative
    // upper-bound approximation only: current size plus the new cell source's own byte
    // length for insert/replace (never fewer bytes than a bare cell edit could add);
    // a "delete" edit is treated as leaving size unchanged rather than guessed smaller,
    // so this guard never under-estimates growth and never treats a delete as a free pass
    // past the cap on a mere label.
    if (typeof toolInput.new_source !== "string") return null;
    const editMode = typeof toolInput.edit_mode === "string" ? toolInput.edit_mode : "replace";
    const currentBytes = Buffer.byteLength(currentContent, "utf8");
    if (editMode === "delete") return currentBytes;
    return currentBytes + Buffer.byteLength(toolInput.new_source, "utf8");
  }

  return null;
}

/**
 * @param {object} input the PreToolUse hook payload (`tool_name`, `tool_input`)
 * @param {object} [options]
 * @param {string} [options.rootDir] the project root; defaults to `process.cwd()`
 * @param {string} [options.rotateScriptPath] override for the path named in the refusal message (tests only)
 */
export function evaluateHandoverSizeGuard(input, { rootDir = process.cwd(), rotateScriptPath = DEFAULT_ROTATE_SCRIPT_PATH } = {}) {
  const toolName = String(input?.tool_name ?? "");
  if (!WRITE_TOOLS.includes(toolName)) return verdict(0);

  const filePath = writeTargetPath(input?.tool_input, toolName);
  if (filePath === "") return verdict(0);

  const config = resolveHandoverConfig({ rootDir });
  const root = resolve(rootDir);
  const targetAbs = resolve(root, filePath);
  const handoverAbs = resolve(root, config.path);
  if (targetAbs !== handoverAbs) return verdict(0); // inert for every other file -- the overwhelming common case

  const currentContent = existsSync(handoverAbs) ? readFileSync(handoverAbs, "utf8") : "";
  const currentBytes = Buffer.byteLength(currentContent, "utf8");
  const proposedBytes = proposedHandoverBytes(input, currentContent);
  if (proposedBytes === null) return verdict(0); // shape this guard cannot read -- fail open

  if (proposedBytes < currentBytes) return verdict(0); // a net decrease (a rotation) is never blocked

  if (proposedBytes >= config.maxBytes) {
    return blocked({
      currentBytes, maxBytes: config.maxBytes, proposedBytes, handoverPath: config.path, rotateScriptPath,
    });
  }

  return verdict(0); // below cap and not a decrease: today's behaviour, unaffected
}

if (isDirectInvocation(import.meta.url)) {
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { raw += chunk; });
  process.stdin.on("end", () => {
    let input;
    try {
      input = JSON.parse(raw || "{}");
    } catch {
      process.exit(0); // malformed hook input is not this guard's decision to make -- fail open
      return;
    }
    const result = evaluateHandoverSizeGuard(input);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  });
}
