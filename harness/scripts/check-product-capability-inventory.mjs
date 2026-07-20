#!/usr/bin/env node
/**
 * Checks the staged Hawkeye product-capability inventory.
 *
 * The inventory is deliberately a closed, evidence-only index.  It does not
 * derive marketing claims from prose: every claimed capability is bound to the
 * current directly discoverable product surface, code/configuration evidence,
 * and (until the documentation reduction lands) a pending public anchor.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "../../plugins/pipeline-core/lib/yaml-lite.mjs";

const SCHEMA = "pipeline.product-capability-inventory.v1";
const INVENTORY_PATH = "docs/product-capability-inventory.json";
const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_OID_RE = /^[a-f0-9]{40,64}$/;
const STATUS = new Set(["shipped", "optional", "host-dependent", "deprecated", "planned"]);
const RUNNER_DISPOSITION_STATUS = new Set(["supported", "optional", "host-dependent", "unavailable"]);
const SURFACE_KINDS = new Set([
  "skill", "agent-role", "human-role", "profile", "duty", "hook", "guard",
  "verify-phase", "governance-extension", "template-extension", "setup", "publication", "release",
]);
const RUNNERS = new Set(["runner-neutral", "codex", "claude", "host-only"]);
const PLATFORMS = new Set(["all", "linux", "wsl", "macos", "windows"]);
const OPERATING_SHAPES = new Set(["solo", "small-team", "multi-team"]);
const DOCUMENTS = new Set(["README", "FLOW", "OPERATING_MODEL", "SETUP"]);
const TARGET_STATUS = new Set(["pending", "active"]);
const REASON_CODE = /^[a-z]+(?:-[a-z]+)*$/;

function utf8Compare(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sortedUniqueStrings(value) {
  return Array.isArray(value)
    && value.every((item) => typeof item === "string")
    && value.every((item, index) => index === 0 || utf8Compare(value[index - 1], item) < 0);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort(utf8Compare);
  const expected = [...keys].sort(utf8Compare);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function fail(findings, message) {
  findings.push(message);
}

function repoPath(root, path) {
  if (typeof path !== "string" || path === "" || isAbsolute(path)) return null;
  const cleaned = normalize(path);
  if (cleaned === ".." || cleaned.startsWith(`..${sep}`)) return null;
  const resolved = resolve(root, cleaned);
  if (relative(root, resolved).startsWith("..") || relative(root, resolved) === "") return null;
  return resolved;
}

function existingRepoPath(root, path, findings, label, { regularFile = false } = {}) {
  const resolved = repoPath(root, path);
  if (!resolved || !existsSync(resolved)) {
    fail(findings, `${label} must be an existing repo-relative path: ${String(path)}`);
    return false;
  }
  if (regularFile && !lstatSync(resolved).isFile()) {
    fail(findings, `${label} must name a regular file: ${path}`);
    return false;
  }
  return true;
}

function walkFiles(root, start, accept) {
  const absolute = join(root, start);
  if (!existsSync(absolute)) return [];
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => utf8Compare(a.name, b.name))) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join("/");
        if (accept(path)) found.push(path);
      }
    }
  };
  visit(absolute);
  return found.sort(utf8Compare);
}

function safeStem(path) {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "").replace(/\.mjs$/, "");
}

function hookMembers(path, contents) {
  const parsed = JSON.parse(contents);
  const members = [];
  for (const [event, registrations] of Object.entries(parsed.hooks ?? {})) {
    if (!Array.isArray(registrations)) throw new Error(`${path}: hooks.${event} must be an array`);
    registrations.forEach((registration, registrationIndex) => {
      if (!isObject(registration) || !Array.isArray(registration.hooks)) {
        throw new Error(`${path}: hooks.${event}[${registrationIndex}] is malformed`);
      }
      registration.hooks.forEach((hook, hookIndex) => {
        if (!isObject(hook) || typeof hook.command !== "string") {
          throw new Error(`${path}: hooks.${event}[${registrationIndex}].hooks[${hookIndex}] lacks command`);
        }
        const matcher = typeof registration.matcher === "string" ? registration.matcher : "";
        members.push(`${event}:${matcher}:${hook.command}`);
      });
    });
  }
  return members.sort(utf8Compare);
}

function verifyMembers(root) {
  const verifyPath = join(root, "harness/scripts/verify.mjs");
  const source = readFileSync(verifyPath, "utf8");
  const start = source.indexOf("const TEST_SUITES = [");
  const end = source.indexOf("];", start);
  if (start < 0 || end < 0) throw new Error("harness/scripts/verify.mjs TEST_SUITES declaration is unavailable");
  const names = [...source.slice(start, end).matchAll(/\{ name: "([^"]+)"/g)].map((match) => match[1]);
  if (names.length === 0 || new Set(names).size !== names.length) {
    throw new Error("harness/scripts/verify.mjs TEST_SUITES names are missing or duplicate");
  }
  // These are the two manifest-gated phases registered directly below TEST_SUITES.
  return [...names, "security-scan", "validate-manifest"].sort(utf8Compare);
}

function releaseCommandMembers(root) {
  const paths = walkFiles(root, "plugins/pipeline-core/scripts", (path) =>
    /\/(?:codex-plugin-validator-parity|native-plugin-readback|neutral-exclusion-review|neutral-range-plan|public-baseline-diagnose|publication-close-journal)\.mjs$/.test(path),
  );
  return paths.map((path) => ({ path, member: safeStem(path), kind: path.includes("publication") || path.includes("public-") ? "publication" : "release" }));
}

/** Discover exactly the direct product-surface members defined by Hawkeye. */
export function discoverSurfaces(root) {
  const surfaces = [];
  const add = (kind, path, member) => surfaces.push({ surfaceId: `${kind}:${path}:${member}`, kind, path, member });

  for (const path of walkFiles(root, "plugins", (item) => /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(item))) {
    add("skill", path, path.split("/").slice(-2, -1)[0]);
  }
  for (const path of walkFiles(root, "plugins", (item) => /^plugins\/[^/]+\/agents\/[^/]+\.md$/.test(item))) {
    add("agent-role", path, safeStem(path));
  }
  for (const path of walkFiles(root, "roles", (item) => /^roles\/[^/]+\.md$/.test(item))) {
    add("human-role", path, safeStem(path));
  }

  const intentPath = "pipeline.user.yaml";
  const intent = parseYaml(readFileSync(join(root, intentPath), "utf8"));
  if (!isObject(intent?.routing?.profiles) || !isObject(intent?.routing?.duties)) {
    throw new Error("pipeline.user.yaml has no routing.profiles/routing.duties object");
  }
  for (const member of Object.keys(intent.routing.profiles).sort(utf8Compare)) add("profile", intentPath, member);
  for (const member of Object.keys(intent.routing.duties).sort(utf8Compare)) add("duty", intentPath, member);

  for (const path of ["plugins/pipeline-core/hooks/codex-hooks.json", "plugins/pipeline-core/hooks/hooks.json"]) {
    for (const member of hookMembers(path, readFileSync(join(root, path), "utf8"))) add("hook", path, member);
  }
  for (const path of walkFiles(root, "plugins/pipeline-core/hooks", (item) => /\/guard-[^/]+\.mjs$/.test(item) && !item.endsWith(".test.mjs"))) {
    add("guard", path, safeStem(path));
  }
  for (const member of verifyMembers(root)) add("verify-phase", "harness/scripts/verify.mjs", member);

  for (const member of ["guidelines", "policies"]) {
    const path = `governance/examples/${member}`;
    if (existsSync(join(root, path))) add("governance-extension", path, member);
  }
  for (const path of walkFiles(root, "templates", () => true)) add("template-extension", path, path.slice("templates/".length));
  add("setup", "setup.mjs", "setup");
  for (const command of releaseCommandMembers(root)) add(command.kind, command.path, command.member);
  add("publication", ".claude-plugin/marketplace.json", "marketplace");
  add("publication", "plugins/pipeline-core/.claude-plugin/plugin.json", "plugin-manifest");
  add("publication", "plugins/pipeline-core/.codex-plugin/plugin.json", "codex-plugin-manifest");

  const ordered = surfaces.sort((left, right) => utf8Compare(left.surfaceId, right.surfaceId));
  const ids = new Set();
  const composite = new Set();
  for (const surface of ordered) {
    const key = `${surface.kind}\u0000${surface.path}\u0000${surface.member}`;
    if (ids.has(surface.surfaceId) || composite.has(key)) throw new Error(`surface discovery is not unique: ${surface.surfaceId}`);
    ids.add(surface.surfaceId); composite.add(key);
  }
  return ordered;
}

function gitRevision(root, argument) {
  try {
    return execFileSync("git", ["rev-parse", argument], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function isAncestor(root, commit, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, descendant], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function documentPath(document) {
  return {
    README: "README.md",
    FLOW: "PIPELINE_FLOW.md",
    OPERATING_MODEL: "docs/operating-model.md",
    SETUP: "SETUP.md",
  }[document];
}

function targetAnchorExists(root, target) {
  const text = readFileSync(join(root, documentPath(target.document)), "utf8");
  const escaped = target.anchorId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)#{1,6}\\s+[^\\n]*\\{#${escaped}\\}|(?:^|\\n)<!--\\s*anchor:${escaped}\\s*-->`, "u").test(text);
}

function capabilityMarkerExists(root, id) {
  return ["README.md", "PIPELINE_FLOW.md", "docs/operating-model.md", "SETUP.md"].some((path) =>
    readFileSync(join(root, path), "utf8").includes(`<!-- capability:${id} -->`),
  );
}

export function validateInventory({ root, phase = "inventory", inventoryPath = INVENTORY_PATH, requireCurrentBaseline = true, document = undefined }) {
  const findings = [];
  if (phase !== "inventory" && phase !== "final") return { ok: false, findings: [`phase must be inventory or final, got ${phase}`] };
  let inventory = document;
  if (inventory === undefined) {
    const absoluteInventory = repoPath(root, inventoryPath);
    if (!absoluteInventory || !existsSync(absoluteInventory)) return { ok: false, findings: [`inventory is missing: ${inventoryPath}`] };
    try { inventory = JSON.parse(readFileSync(absoluteInventory, "utf8")); }
    catch (error) { return { ok: false, findings: [`inventory is not valid JSON: ${error.message}`] }; }
  }

  const rootKeys = ["schema", "sourceBaseline", "criticReceiptSha256", "surfaces", "capabilities"];
  if (!hasExactKeys(inventory, rootKeys)) fail(findings, `inventory root must have exactly ${rootKeys.join(", ")}`);
  if (inventory.schema !== SCHEMA) fail(findings, `inventory schema must equal ${SCHEMA}`);
  if (!hasExactKeys(inventory.sourceBaseline, ["commit", "tree"]) || !GIT_OID_RE.test(inventory.sourceBaseline?.commit ?? "") || !GIT_OID_RE.test(inventory.sourceBaseline?.tree ?? "")) {
    fail(findings, "sourceBaseline must have exactly full lowercase Git commit and tree");
  } else {
    const baselineCommit = gitRevision(root, `${inventory.sourceBaseline.commit}^{commit}`);
    if (!baselineCommit) {
      fail(findings, "sourceBaseline commit does not resolve as a commit");
    } else {
      const baselineTree = gitRevision(root, `${baselineCommit}^{tree}`);
      if (inventory.sourceBaseline.tree !== baselineTree) fail(findings, "sourceBaseline tree does not match commit");
      if (requireCurrentBaseline && !isAncestor(root, baselineCommit, "HEAD")) {
        fail(findings, "sourceBaseline commit is not an ancestor of current HEAD");
      }
    }
  }
  if (typeof inventory.criticReceiptSha256 !== "string" || !SHA256_RE.test(inventory.criticReceiptSha256)) {
    fail(findings, "criticReceiptSha256 must be a lowercase SHA-256 digest");
  }
  if (!Array.isArray(inventory.surfaces)) fail(findings, "surfaces must be an array");
  if (!Array.isArray(inventory.capabilities)) fail(findings, "capabilities must be an array");

  const surfaceById = new Map();
  const compositeKeys = new Set();
  for (const [index, surface] of (Array.isArray(inventory.surfaces) ? inventory.surfaces : []).entries()) {
    const label = `surfaces[${index}]`;
    if (!hasExactKeys(surface, ["surfaceId", "kind", "path", "member"])) { fail(findings, `${label} has unexpected shape`); continue; }
    if (![surface.surfaceId, surface.kind, surface.path, surface.member].every((value) => typeof value === "string" && value !== "")) fail(findings, `${label} fields must be nonempty strings`);
    if (!SURFACE_KINDS.has(surface.kind)) fail(findings, `${label}.kind is invalid: ${surface.kind}`);
    existingRepoPath(root, surface.path, findings, `${label}.path`);
    const composite = `${surface.kind}\u0000${surface.path}\u0000${surface.member}`;
    if (surfaceById.has(surface.surfaceId)) fail(findings, `duplicate surfaceId: ${surface.surfaceId}`);
    if (compositeKeys.has(composite)) fail(findings, `duplicate surface composite key: ${surface.kind}/${surface.path}/${surface.member}`);
    surfaceById.set(surface.surfaceId, surface); compositeKeys.add(composite);
  }

  let discovered = [];
  try { discovered = discoverSurfaces(root); }
  catch (error) { fail(findings, `surface discovery failed: ${error.message}`); }
  const expectedSurfaceIds = discovered.map((surface) => surface.surfaceId);
  const inventorySurfaceIds = [...surfaceById.keys()].sort(utf8Compare);
  if (expectedSurfaceIds.length !== inventorySurfaceIds.length || expectedSurfaceIds.some((id, index) => id !== inventorySurfaceIds[index])) {
    fail(findings, "inventory surfaces do not exactly cover the discovered current product surface");
  }

  const capabilityIds = new Set();
  const surfaceAssignments = new Map();
  const capabilityKeys = [
    "id", "publicName", "problem", "benefit", "status", "surfaceIds", "runners", "platforms", "operatingShapes",
    "runnerDispositions", "prerequisites", "productionEvidence", "testEvidence", "targets", "configurationPath", "specializedOnlyReason",
  ];
  for (const [index, capability] of (Array.isArray(inventory.capabilities) ? inventory.capabilities : []).entries()) {
    const label = `capabilities[${index}]`;
    if (!hasExactKeys(capability, capabilityKeys)) { fail(findings, `${label} has unexpected shape`); continue; }
    for (const key of ["id", "publicName", "problem", "benefit", "status", "configurationPath"]) {
      if (typeof capability[key] !== "string" || capability[key] === "") fail(findings, `${label}.${key} must be a nonempty string`);
    }
    if (capability.specializedOnlyReason !== null && (typeof capability.specializedOnlyReason !== "string" || capability.specializedOnlyReason === "")) {
      fail(findings, `${label}.specializedOnlyReason must be null or a nonempty string`);
    }
    if (capabilityIds.has(capability.id)) fail(findings, `duplicate capability id: ${capability.id}`);
    capabilityIds.add(capability.id);
    if (!STATUS.has(capability.status)) fail(findings, `${label}.status is invalid: ${capability.status}`);
    for (const key of ["surfaceIds", "runners", "platforms", "operatingShapes", "prerequisites", "productionEvidence", "testEvidence"]) {
      if (!sortedUniqueStrings(capability[key])) fail(findings, `${label}.${key} must be a sorted, duplicate-free string array`);
    }
    if (!Array.isArray(capability.surfaceIds) || capability.surfaceIds.length === 0) fail(findings, `${label}.surfaceIds must be nonempty`);
    for (const id of capability.surfaceIds ?? []) {
      if (!surfaceById.has(id)) fail(findings, `${label} references missing surface ${id}`);
      else if (surfaceAssignments.has(id)) fail(findings, `surface ${id} belongs to both ${surfaceAssignments.get(id)} and ${capability.id}`);
      else surfaceAssignments.set(id, capability.id);
    }
    for (const [key, allowed] of [["runners", RUNNERS], ["platforms", PLATFORMS], ["operatingShapes", OPERATING_SHAPES]]) {
      for (const value of capability[key] ?? []) if (!allowed.has(value)) fail(findings, `${label}.${key} has invalid value ${value}`);
      if (!Array.isArray(capability[key]) || capability[key].length === 0) fail(findings, `${label}.${key} must be nonempty for an available support matrix`);
    }
    if (!hasExactKeys(capability.runnerDispositions, ["claude", "codex"])) {
      fail(findings, `${label}.runnerDispositions has unexpected shape`);
    } else {
      for (const runner of ["claude", "codex"]) {
        const disposition = capability.runnerDispositions[runner];
        const dispositionLabel = `${label}.runnerDispositions.${runner}`;
        if (!hasExactKeys(disposition, ["status", "reasonCode"])) {
          fail(findings, `${dispositionLabel} has unexpected shape`);
          continue;
        }
        if (!RUNNER_DISPOSITION_STATUS.has(disposition.status)) {
          fail(findings, `${dispositionLabel}.status is invalid: ${disposition.status}`);
          continue;
        }
        if (disposition.status === "supported" && disposition.reasonCode !== null) {
          fail(findings, `${dispositionLabel} supported must have null reasonCode`);
        }
        if (disposition.status !== "supported" && (typeof disposition.reasonCode !== "string" || !REASON_CODE.test(disposition.reasonCode))) {
          fail(findings, `${runner === "codex" ? "Codex" : "Claude"} ${disposition.status} ${dispositionLabel} requires a safe nonempty lowercase-hyphenated reasonCode`);
        }
        const declared = capability.runners?.includes(runner) || capability.runners?.includes("runner-neutral");
        if (declared && disposition.status === "unavailable") {
          fail(findings, `${runner === "codex" ? "Codex" : "Claude"} support matrix conflicts with ${dispositionLabel}`);
        }
        if (!declared && disposition.status !== "unavailable") {
          fail(findings, `${runner === "codex" ? "Codex" : "Claude"} support matrix conflicts with ${dispositionLabel}`);
        }
      }
    }
    if (capability.configurationPath !== "none") existingRepoPath(root, capability.configurationPath, findings, `${label}.configurationPath`);
    if (!Array.isArray(capability.productionEvidence) || capability.productionEvidence.length === 0) fail(findings, `${label}.productionEvidence must be nonempty`);
    for (const path of capability.productionEvidence ?? []) existingRepoPath(root, path, findings, `${label}.productionEvidence`);
    if (capability.status !== "planned" && (!Array.isArray(capability.testEvidence) || capability.testEvidence.length === 0)) {
      fail(findings, `${label} is ${capability.status} but has no testEvidence`);
    }
    for (const path of capability.testEvidence ?? []) existingRepoPath(root, path, findings, `${label}.testEvidence`, { regularFile: true });
    if (!Array.isArray(capability.targets)) fail(findings, `${label}.targets must be an array`);
    if (capability.targets?.length === 0 && capability.specializedOnlyReason === null) fail(findings, `${label} needs a target or specializedOnlyReason`);
    if (capability.targets?.length > 0 && capability.specializedOnlyReason !== null) fail(findings, `${label} has targets and must have null specializedOnlyReason`);
    const targetIds = new Set();
    for (const [targetIndex, target] of (capability.targets ?? []).entries()) {
      const targetLabel = `${label}.targets[${targetIndex}]`;
      if (!hasExactKeys(target, ["document", "anchorId", "status"])) { fail(findings, `${targetLabel} has unexpected shape`); continue; }
      if (!DOCUMENTS.has(target.document) || typeof target.anchorId !== "string" || target.anchorId === "" || !TARGET_STATUS.has(target.status)) {
        fail(findings, `${targetLabel} has invalid document, anchorId, or status`);
      }
      const key = `${target.document}\u0000${target.anchorId}`;
      if (targetIds.has(key)) fail(findings, `${targetLabel} repeats target ${target.document}/${target.anchorId}`);
      targetIds.add(key);
      if (phase === "inventory" && target.status !== "pending") fail(findings, `${targetLabel} must be pending during inventory phase`);
      if (phase === "final" && target.status !== "active") fail(findings, `${targetLabel} must be active during final phase`);
      if (target.status === "active" && !targetAnchorExists(root, target)) fail(findings, `${targetLabel} active anchor is missing`);
    }
    if (capability.status === "shipped" && (capability.runners?.length === 0 || capability.platforms?.length === 0 || capability.operatingShapes?.length === 0)) {
      fail(findings, `${label} makes an unsupported shipped claim`);
    }
    if (capability.status === "planned" && (capability.targets ?? []).some((target) => target.status === "active")) {
      fail(findings, `${label} presents planned capability as active`);
    }
    if (phase === "final" && !capabilityMarkerExists(root, capability.id)) fail(findings, `${label} has no public capability marker`);
  }
  for (const id of surfaceById.keys()) if (!surfaceAssignments.has(id)) fail(findings, `discovered surface is absent from every capability: ${id}`);
  for (const id of surfaceAssignments.keys()) if (!surfaceById.has(id)) fail(findings, `capability maps unknown surface: ${id}`);
  return { ok: findings.length === 0, findings };
}

function parseArgs(argv) {
  let phase = "inventory";
  let root = null;
  let inventoryPath = INVENTORY_PATH;
  let printDiscovered = false;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--phase") phase = argv[++index];
    else if (value === "--root") root = argv[++index];
    else if (value === "--inventory") inventoryPath = argv[++index];
    else if (value === "--print-discovered") printDiscovered = true;
    else if (value === "--help") return { help: true };
    else return { error: `unknown argument: ${value}` };
  }
  if (!root) root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return { phase, root: resolve(root), inventoryPath, printDiscovered };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node harness/scripts/check-product-capability-inventory.mjs [--phase inventory|final] [--root PATH] [--inventory PATH] [--print-discovered]");
    return 0;
  }
  if (args.error) { console.error(args.error); return 2; }
  if (args.printDiscovered) {
    try { console.log(JSON.stringify(discoverSurfaces(args.root), null, 2)); return 0; }
    catch (error) { console.error(`FAIL: ${error.message}`); return 1; }
  }
  const result = validateInventory(args);
  if (result.ok) { console.log(`PASS: product capability inventory (${args.phase})`); return 0; }
  for (const finding of result.findings) console.error(`FAIL: ${finding}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
