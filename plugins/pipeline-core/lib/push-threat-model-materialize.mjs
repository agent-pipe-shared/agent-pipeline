// SPDX-License-Identifier: SUL-1.0
/**
 * Candidate 22 (CGR-18, CGF-19): what `materialize-push-threat-model` writes, and how an unchanged copy is recognised.
 *
 * The shipped template describes the signing ceremony and nothing about the project, so a copy of it that nobody completed still passed the
 * push threat-model gate and the push was signed under a document that never named the project. Materialising now fills every field the
 * project already knows (name, stakes, repository mode, push approval, how the human clears it, destination policy, branch, remote names) and
 * leaves the agent exactly the part that is judgement: one marked section. Deleting the marker line is the agent's statement that the section
 * is written; the gate (`push-threat-model-gate.mjs`) reports the file `template-unchanged` while the marker is there or while the file is
 * still the shipped template byte for byte (line endings aside, so a Windows checkout reads the same).
 *
 * Reading only: nothing here writes a file. Remote URLs are never copied (they can carry credentials); names only.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { readHumanApprovalMode } from "./critical-human-proof-policy.mjs";
import { gateConfig, loadManifestSafe } from "./manifest.mjs";
import { CALIBRATION_PATHS } from "./project-authority-read.mjs";

export const PUSH_THREAT_MODEL_UNCHANGED_MARKER = "<!-- push-threat-model: project judgement pending; delete this whole line once the questions below are answered for this project -->";

const lf = (text) => String(text).replace(/\r\n/gu, "\n");

function readCalibration(root) {
  for (const rel of CALIBRATION_PATHS) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    try { const parsed = JSON.parse(readFileSync(path, "utf8")); return parsed !== null && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
  }
  return {};
}

function gitLines(root, args) {
  try {
    const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000, shell: false });
    return result.status === 0 && typeof result.stdout === "string" ? result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) : [];
  } catch { return []; }
}

const text = (value) => (typeof value === "string" && value.trim() !== "" ? value : null);

/**
 * The project-known facts. `deps` (`branch`, `remotes`, `approvalMode`) are test seams; absent, they are read from the repository.
 * @returns {{project: string|null, stakes: string|null, repositoryMode: string|null, pushApproval: string|null, approvalMode: string|null,
 *   checkpointNamespace: string|null, branch: string|null, remotes: string[]}}
 */
export function collectPushThreatModelFacts(root, deps = {}) {
  const calibration = readCalibration(root);
  let manifest = null;
  try { manifest = loadManifestSafe(root); } catch { manifest = null; }
  let pushApproval = null;
  try { pushApproval = text(gateConfig(manifest, "push")?.approval); } catch { pushApproval = null; }
  let approvalMode = deps.approvalMode ?? null;
  if (approvalMode === null) { try { approvalMode = text(readHumanApprovalMode(root, { legacyKind: "push" })?.mode); } catch { approvalMode = null; } }
  return {
    project: text(calibration.project),
    stakes: text(calibration.stakes),
    repositoryMode: text(calibration.repositoryMode),
    pushApproval,
    approvalMode,
    checkpointNamespace: text(manifest?.pushDestinationPolicy?.checkpointNamespace),
    branch: deps.branch !== undefined ? deps.branch : (gitLines(root, ["symbolic-ref", "--short", "-q", "HEAD"])[0] ?? null),
    remotes: deps.remotes !== undefined ? deps.remotes : gitLines(root, ["remote"]),
  };
}

/** The shipped template, whole and first, then the filled facts, then the one judgement section with its marker. */
export function renderPushThreatModel(templateText, facts) {
  const one = (value) => (value === null || value === undefined || value === "" ? "not set" : `\`${String(value).replace(/[`\r\n]+/gu, " ").trim()}\``);
  const remotes = Array.isArray(facts.remotes) && facts.remotes.length > 0 ? facts.remotes.map(one).join(", ") : "not set";
  const lines = [
    "",
    "## Project facts (filled in when this file was created)",
    "",
    "These are read from the project, not judged: correct a line below if the project changed since.",
    "",
    `- Project: ${one(facts.project)}`,
    `- Calibrated stakes: ${one(facts.stakes)}`,
    `- Repository mode (calibration): ${one(facts.repositoryMode)}`,
    `- Push approval gate (manifest): ${one(facts.pushApproval)}`,
    `- How the human clears the push gate (\`gates.push_approval\`): ${one(facts.approvalMode)}`,
    `- Checkpoint destination namespace (manifest): ${one(facts.checkpointNamespace)}`,
    `- Branch when this file was created: ${one(facts.branch)}`,
    `- Configured remotes (names only): ${remotes}`,
    "",
    "## Project judgement (the part only the project can answer)",
    "",
    PUSH_THREAT_MODEL_UNCHANGED_MARKER,
    "",
    "Answer each question for this project in plain words, then delete the marker line above. Until then this file reads as the unchanged template.",
    "",
    "1. What does a push of this project release, to whom, and which remote and branch does it really reach?",
    "2. Which branch rules, deploy targets or consumers depend on that remote, and what happens when a wrong commit lands there?",
    "3. How is a pushed commit rolled back or superseded here?",
    "4. Which residual risk does the generic table above not cover for this project?",
    "",
  ];
  const head = String(templateText);
  return `${head}${head.endsWith("\n") ? "" : "\n"}${lines.join("\n")}`;
}

/** True while the marker is still there, or the file is the shipped template itself (line endings aside). */
export function isPushThreatModelTemplateUnchanged(fileText, templateText) {
  const body = lf(fileText);
  return body.includes(PUSH_THREAT_MODEL_UNCHANGED_MARKER) || (typeof templateText === "string" && body.trimEnd() === lf(templateText).trimEnd());
}
