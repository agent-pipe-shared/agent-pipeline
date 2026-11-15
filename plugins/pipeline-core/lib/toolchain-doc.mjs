// SPDX-License-Identifier: SUL-1.0
/**
 * C28e: renders docs/toolchain.md from the one tool registry (lib/toolchain-registry.mjs). The source repository's generator script writes it;
 * lib/toolchain-registry.test.mjs fails when the committed file differs from this rendering, so the document never drifts from the registry.
 */
import { TOOLCHAIN_REGISTRY } from "./toolchain-registry.mjs";

const PLATFORM_NAMES = Object.freeze({ linux: "Linux and WSL", darwin: "macOS", win32: "Windows" });
const CLASS_TITLES = Object.freeze({
  required: "Required on every machine",
  "required-with-infrastructure": "Required where the project has infrastructure or container files",
  "required-to-sign": "Required on the machine of the person who signs",
  optional: "Optional",
  "project-setting": "Settings in the project's own build",
});
const CLASS_INTROS = Object.freeze({
  required: "The feature close runs these. Onboarding checks them and asks you to install a missing one together with your agent; you may defer one, and the deferral is recorded on this machine. A deferral does not lift any check: a project calibrated critical refuses a missing scanner at plan approval and at the close, and any other project gets a notice there.",
  "required-with-infrastructure": "The feature close runs this only when the project's tracked files hold a Dockerfile or Containerfile, a Terraform file or a Kubernetes manifest; anywhere else the scan reads not applicable and needs no install. Where such files exist, a missing tool is treated like a missing required one, and it may be deferred the same way.",
  "required-to-sign": "Signed approvals (the default push gate, signed overrides, acceptance by signature) need this on the machine where the PO signs. The readiness report checks it as `signing-toolchain`.",
  optional: "A feature that works without these, or has a fallback. Install one when you use the feature it names.",
  "project-setting": "Not programs: switches in the project's build that produce the files the SBOM of the close reads. The close names the one that is missing.",
});

// Registry text marks commands and paths as `code`; outside a code span a backslash, a placeholder in angle brackets or a star must survive
// Markdown rendering.
const md = (text) => text.split(/(`[^`]*`)/u).map((part) => (part.startsWith("`") ? part : part.replace(/[\\<>*]/gu, (char) => `\\${char}`))).join("");

/** The complete Markdown text of docs/toolchain.md, deterministic for one registry. */
export function renderToolchainDoc() {
  const lines = [
    "# Tools the Pipeline needs",
    "",
    "<!-- GENERATED from plugins/pipeline-core/lib/toolchain-registry.mjs by the source repository's generate-toolchain-doc script; do not edit by hand. -->",
    "",
    "Every program the Pipeline runs on a machine, and every optional one it can use. Install a tool yourself, in your own terminal (in a Claude session you can run the command with the `!` prefix); the Pipeline's own checks never install anything. The install routes below name the vendor's official source. Afterwards the tool must resolve from a directory the Pipeline trusts: the system directories, `~/.local/bin` and `~/go/bin`; on Windows the named `C:\\Program Files` directories and `%USERPROFILE%\\.local\\bin`; or a root you list in `~/.config/agent-pipeline/trusted-tool-roots.json`.",
    "",
    "Check the state of this machine with `node <plugin root>/scripts/toolchain-preflight.mjs --environment-readiness`. Record that you install a required tool later with `node <plugin root>/scripts/toolchain-defer.mjs --tool <id> --answer \"<your answer>\"`, and remove the record with `--clear <id>`.",
    "",
  ];
  for (const toolClass of Object.keys(CLASS_TITLES)) {
    const entries = TOOLCHAIN_REGISTRY.filter((entry) => entry.class === toolClass);
    if (entries.length === 0) continue;
    lines.push(`## ${CLASS_TITLES[toolClass]}`, "", CLASS_INTROS[toolClass], "");
    for (const entry of entries) {
      const check = toolClass === "project-setting" ? `${md(entry.probe)} (what the close looks for)` : `\`${entry.probe}\``;
      lines.push(`### ${entry.id}`, "", `- **Purpose:** ${md(entry.purpose)}.`, `- **Used by:** ${md(entry.usedBy.join("; "))}.`, `- **Minimum:** ${md(entry.floor.text)}.`, `- **Check:** ${check}.`);
      for (const [platform, name] of Object.entries(PLATFORM_NAMES)) lines.push(`- **${name}:** ${md(entry.install[platform])}.`);
      lines.push("");
    }
  }
  return `${lines.join("\n").replace(/\n+$/u, "")}\n`;
}
