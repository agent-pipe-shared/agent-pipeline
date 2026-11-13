// SPDX-License-Identifier: SUL-1.0
/**
 * D247 follow-up: an agent's own Write/Edit never lands in the pipeline-owned private state.
 *
 * `.git/agent-pipeline/**` holds what the plugin's hooks and producer scripts record about this
 * repository: host observations of a design review (`design-review-observations/`), readiness host
 * receipts, override requests and more. A record there is only worth something when no agent can
 * write it, and the canon has always said so (`templates/prompts/goldfish-task.md`, the
 * pipeline-start `scratch-and-directory.md` reference). A live probe on 2026-11-13 showed that a
 * native Write into that tree was admitted. This predicate is the refusal.
 *
 * `privateStateWriteRefusal({ target, realTarget })` refuses when either the lexical absolute target
 * or the real location of its deepest existing ancestor (a symlink into `.git` from an ordinary
 * folder) lies inside a `.git/agent-pipeline` directory. The plugin's own scripts write there with
 * the file system, never through an agent tool call, so this route is never needed for them.
 *
 * Pure: the caller passes both paths. Returns null when the write is none of this predicate's business.
 */
export const PRIVATE_STATE_AGENT_WRITE = "PRIVATE-STATE-AGENT-WRITE";

const MESSAGE = "This write targets the pipeline-owned private state under .git/agent-pipeline/. "
  + "Only the plugin's hooks and producer scripts write there; a record an agent could write would prove nothing "
  + "(a design review observation, a readiness host receipt, an override request). Use scratch/ for notes and evidence, "
  + "and the sanctioned command of the route for anything the pipeline records.";

function insidePrivateState(path) {
  if (typeof path !== "string" || path === "") return false;
  const parts = path.split(/[\\/]+/u);
  for (let i = 0; i + 1 < parts.length; i += 1) if (parts[i] === ".git" && parts[i + 1] === "agent-pipeline") return true;
  return false;
}

/**
 * @param {{ target?: unknown, realTarget?: unknown }} [input] absolute paths of the write target, lexical and resolved
 * @returns {{ code: string, message: string } | null}
 */
export function privateStateWriteRefusal(input) {
  try {
    if (insidePrivateState(input?.target) || insidePrivateState(input?.realTarget)) return { code: PRIVATE_STATE_AGENT_WRITE, message: MESSAGE };
    return null;
  } catch {
    return null;
  }
}
