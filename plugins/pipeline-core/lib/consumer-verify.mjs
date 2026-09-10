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
