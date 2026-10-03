// SPDX-License-Identifier: SUL-1.0
import { processClaudeIntakePromptSubmit } from "../lib/claude-intake-prompt-capture.mjs";

const MAX_HOOK_INPUT_BYTES = 3_000_000;

async function readBoundedStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_HOOK_INPUT_BYTES) throw new Error("CLAUDE-INTAKE-HOOK-INPUT-TOO-LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

try {
  const raw = await readBoundedStdin();
  let input;
  try { input = JSON.parse(raw.toString("utf8")); }
  catch { throw new Error("CLAUDE-INTAKE-HOOK-INPUT-MALFORMED"); }
  const result = processClaudeIntakePromptSubmit(input);
  if (result.status === "available") emit(result.hookOutput);
  else process.stderr.write(`${result.code}\n`);
} catch (error) {
  process.stderr.write(`${error?.message || "CLAUDE-INTAKE-HOOK-UNAVAILABLE"}\n`);
}
