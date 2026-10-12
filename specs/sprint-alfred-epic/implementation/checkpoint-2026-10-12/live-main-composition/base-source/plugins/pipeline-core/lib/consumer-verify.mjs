// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAuthorityArtifactPath } from "./project-authority.mjs";

export const CONSUMER_VERIFY_ADAPTER_PATH = "project/consumer-verify.mjs";
// Installation location is supplied as an argv value, never embedded in project bytes.
export const CONSUMER_VERIFY_ADAPTER = `// Pipeline consumer Verify adapter v1\nconst [dispatcher, check, ...args] = process.argv.slice(2);\nconst { runConsumerVerifyCheck } = await import(dispatcher);\nprocess.exitCode = runConsumerVerifyCheck(check, ...args);\n`;
export const CONSUMER_VERIFY_DISPATCHER = new URL("../scripts/consumer-verify-check.mjs", import.meta.url).href;

const VERIFY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
function commandEntry(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !VERIFY_ID.test(value.id)
    || typeof value.command !== "string" || value.command.trim() === "") throw new Error(`VEP-IMPACT-CONFIG: invalid ${label} command.`);
  if (/verify-evidence-producer\.mjs|consumer-verify\.mjs|consumer-verify-check\.mjs/u.test(value.command)) throw new Error(`VEP-IMPACT-CONFIG: recursive ${label} command.`);
  return Object.freeze({ id: value.id, command: value.command });
}

export function readConsumerVerifyConfiguration(rootDir) {
  const artifact = resolveAuthorityArtifactPath("calibration", { rootDir });
  if (!artifact.exists) throw new Error("VEP-NO-CALIBRATION: no project calibration found.");
  const calibration = JSON.parse(readFileSync(artifact.path, "utf8"));
  const project = typeof calibration?.project === "string" && calibration.project.trim() ? calibration.project : "unspecified";
  const fullCommand = typeof calibration?.verify === "string" && calibration.verify.trim()
    && !calibration.verify.includes("the verify contract of this project is not configured") ? calibration.verify : null;
  if (fullCommand !== null && /verify-evidence-producer\.mjs|consumer-verify\.mjs|consumer-verify-check\.mjs/u.test(fullCommand)) throw new Error("VEP-IMPACT-CONFIG: recursive full command.");
  const impact = calibration?.verifyImpact;
  if (impact === undefined) return Object.freeze({ project, fullCommand, baseline: [], areas: [] });
  if (!impact || typeof impact !== "object" || Array.isArray(impact) || impact.schema !== "pipeline.project-verify-impact.v1"
    || !Array.isArray(impact.baseline) || !Array.isArray(impact.areas)) throw new Error("VEP-IMPACT-CONFIG: invalid root.");
  const ids = new Set();
  const baseline = impact.baseline.map((entry) => commandEntry(entry, "baseline"));
  const areas = impact.areas.map((area) => {
    if (!area || typeof area !== "object" || Array.isArray(area) || !VERIFY_ID.test(area.id) || !Array.isArray(area.paths)
      || area.paths.length === 0 || !area.paths.every((path) => typeof path === "string") || !Array.isArray(area.commands) || area.commands.length === 0) {
      throw new Error("VEP-IMPACT-CONFIG: invalid area.");
    }
    return Object.freeze({ id: area.id, paths: Object.freeze([...new Set(area.paths)].sort()), commands: Object.freeze(area.commands.map((entry) => commandEntry(entry, `area ${area.id}`))) });
  });
  for (const entry of [...baseline, ...areas.flatMap((area) => area.commands)]) {
    if (ids.has(entry.id)) throw new Error(`VEP-IMPACT-CONFIG: duplicate command id ${entry.id}.`);
    ids.add(entry.id);
  }
  return Object.freeze({ project, fullCommand, baseline: Object.freeze(baseline), areas: Object.freeze(areas) });
}

export function assertConsumerVerifyAdapter(rootDir) {
  const path = resolve(rootDir, CONSUMER_VERIFY_ADAPTER_PATH);
  if (!existsSync(path)) throw new Error("VEP-PREPARATION-REQUIRED: run verify-evidence-producer.mjs --prepare --root <repo>, then commit the adapter.");
  if (!lstatSync(path).isFile() || realpathSync(path) !== path || readFileSync(path, "utf8") !== CONSUMER_VERIFY_ADAPTER) {
    throw new Error(`VEP-ADAPTER-CONFLICT: preserve and resolve ${CONSUMER_VERIFY_ADAPTER_PATH}.`);
  }
  return path;
}

export function prepareConsumerVerify({ rootDir = process.cwd() } = {}) {
  const root = realpathSync(rootDir);
  const path = join(root, CONSUMER_VERIFY_ADAPTER_PATH);
  if (existsSync(path)) { assertConsumerVerifyAdapter(root); return { status: "unchanged", path: CONSUMER_VERIFY_ADAPTER_PATH }; }
  if (existsSync(dirname(path)) && (realpathSync(dirname(path)) !== dirname(path) || !lstatSync(dirname(path)).isDirectory())) throw new Error("VEP-ADAPTER-CONFLICT: project directory is not a physical directory.");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, CONSUMER_VERIFY_ADAPTER, { flag: "wx" });
  return { status: "prepared", path: CONSUMER_VERIFY_ADAPTER_PATH };
}

// Conservative installed-package binding includes dispatcher dependencies, schemas,
// and policy data. No source-checkout paths or source suite lists are required.
export function consumerVerifyPolicy(root) {
  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const hash = createHash("sha256");
  function visit(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = `${prefix}${entry.name}`;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("VEP-IMPLEMENTATION-UNSAFE");
      if (entry.isDirectory()) visit(path, `${rel}/`);
      else if (entry.isFile()) hash.update(JSON.stringify([rel, createHash("sha256").update(readFileSync(path)).digest("hex")]));
    }
  }
  visit(packageRoot);
  return {
    contract: "pipeline.consumer-verify.v1",
    implementationSha256: hash.digest("hex"),
    authorityInputs: ["calibration", "manifest", "state", "guardConfig"].map((kind) => {
      const artifact = resolveAuthorityArtifactPath(kind, { rootDir: root });
      return { kind, path: artifact.relPath, sha256: artifact.exists ? createHash("sha256").update(readFileSync(artifact.path)).digest("hex") : null };
    }),
  };
}
