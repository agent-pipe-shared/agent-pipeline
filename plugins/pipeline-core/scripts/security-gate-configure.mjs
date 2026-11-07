#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * security-gate-configure.mjs -- the one command that configures a missing security gate (Candidate 20, G20-25, AC-108).
 *
 * A project calibrated critical (stakes) whose manifest configures no `gates.security` (no manifest, no gate, or mode off) is refused at
 * close and at Verify (SEC-CLOSE-GATE-NOT-CONFIGURED); that refusal names exactly this command:
 *
 *   node <plugin-root>/scripts/security-gate-configure.mjs --root <project root>
 *
 * It sets `gates.security` to the block onboarding writes for a new project (mode: blocking, type: automated), in the manifest tier the
 * loader reads, and changes no other byte of the file (comments, order, line endings and every other gate stay as they are). Idempotent:
 * a gate that is already configured (any mode but off) is reported and left alone. A twin manifest pair (project/pipeline.yaml and
 * .claude/pipeline.yaml) receives the same edit in both files, so the pair does not drift (PA-MANIFEST-DRIFT). The manifest is created
 * only where the loader would read it, when no tier exists.
 *
 * Nothing is written unless the edited bytes validate as a manifest with a blocking security gate and differ from the original only in
 * gates.security. A refusal (invalid manifest, a shape that cannot be edited byte-safely, a bad argument) exits 1 and writes nothing.
 * It never repairs a broken manifest and needs no ceremony: it only strengthens the project's own gate.
 *
 * VERIFY: node --test plugins/pipeline-core/lib/pins/security-close-chain-is-hard-per-calibration.test.mjs
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { gateConfig, validateManifest } from "../lib/manifest.mjs";
import { LEGACY_MANIFEST, NEUTRAL_MANIFEST, resolveAuthorityArtifactPath } from "../lib/project-authority-read.mjs";
import { parseYaml } from "../lib/yaml-lite.mjs";

/** The block onboarding writes for a new project (lib/project-onboarding-v3.mjs, DEV_PLAN_BLOCKING_GATE); pinned equal by the C12 pin. */
export const SECURITY_GATE_BLOCK = "  security:\n    mode: blocking\n    type: automated\n";
export const SECURITY_GATE_CONFIGURE_REFUSED = "SEC-GATE-CONFIGURE-REFUSED";

const refusal = (reason) => ({ refusal: reason });
const lineBody = (line) => line.replace(/\r?\n$/u, "");
const stripSecurityGate = (manifest) => {
  const copy = structuredClone(manifest);
  if (copy.gates && typeof copy.gates === "object") delete copy.gates.security;
  if (copy.gates === null || (copy.gates && Object.keys(copy.gates).length === 0)) delete copy.gates;
  return copy;
};

/** Returns {text} (the edited bytes), {unchanged: true}, or {refusal}. Pure: reads nothing but its arguments. */
export function configureManifestText(text, rootDir) {
  let parsed;
  try { parsed = parseYaml(text); } catch (error) { return refusal(`the manifest cannot be parsed (${error instanceof Error ? error.message : String(error)}); it is not repaired here`); }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return refusal("the manifest is not a mapping");
  const current = parsed.gates?.security;
  if (current && typeof current === "object" && current.mode !== "off") return { unchanged: true, mode: current.mode };

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const block = (indent) => SECURITY_GATE_BLOCK.replace(/^ {2}/gmu, indent).replace(/\n/gu, eol);
  const insert = (index, chunk) => {
    const out = lines.slice();
    if (index > 0 && !out[index - 1].endsWith("\n")) out[index - 1] += eol;
    out.splice(index, 0, chunk);
    return out.join("");
  };
  const finish = (edited) => {
    let reparsed;
    try { reparsed = parseYaml(edited); } catch (error) { return refusal(`the edited manifest does not parse (${error instanceof Error ? error.message : String(error)})`); }
    const checked = validateManifest(reparsed, { rootDir });
    if (checked.status !== "ok") return refusal(`the edited manifest would be invalid: ${JSON.stringify(checked.errors.slice(0, 3))}`);
    const gate = gateConfig(reparsed, "security");
    if (gate?.mode !== "blocking") return refusal("the edited manifest does not configure a blocking security gate");
    if (!isDeepStrictEqual(stripSecurityGate(parsed), stripSecurityGate(reparsed))) return refusal("the edit would change more than gates.security");
    return { text: edited };
  };

  if (!Object.hasOwn(parsed, "gates")) return finish(insert(lines.length, `gates:${eol}${block("  ")}`));
  const gatesAt = lines.findIndex((line) => /^gates:[ \t]*(?:#.*)?\r?\n?$/u.test(line));
  if (gatesAt < 0) return refusal("gates is not a plain block mapping (flow style or an inline value); set gates.security to mode: blocking, type: automated by hand");
  let end = lines.length;
  let last = gatesAt;
  let childIndent = null;
  for (let i = gatesAt + 1; i < lines.length; i += 1) {
    const body = lineBody(lines[i]);
    if (/^\s*$/u.test(body)) continue;
    if (/^\S/u.test(body)) { if (body.startsWith("#")) continue; end = i; break; }
    last = i;
    if (childIndent === null && !/^\s*#/u.test(body)) childIndent = /^ */u.exec(body)[0];
  }
  const indent = childIndent ?? "  ";
  const securityAt = lines.findIndex((line, i) => i > gatesAt && i < end && new RegExp(`^${indent}security:`, "u").test(line));
  if (securityAt < 0) return finish(insert(last + 1, block(indent)));
  if (!/^[ \t]*(?:#.*)?$/u.test(lineBody(lines[securityAt]).slice(indent.length + "security:".length))) {
    return refusal("gates.security is written in flow style; set it to mode: blocking, type: automated by hand");
  }
  const out = lines.slice();
  let modeEdited = false;
  for (let i = securityAt + 1; i < end; i += 1) {
    const body = lineBody(lines[i]);
    if (/^\s*$/u.test(body)) continue;
    if (!body.startsWith(`${indent} `)) break;
    const mode = /^(\s+mode:[ \t]*)(\S+)([ \t]*(?:#.*)?)$/u.exec(body);
    const type = /^(\s+type:[ \t]*)(\S+)([ \t]*(?:#.*)?)$/u.exec(body);
    if (mode && /^["']?off["']?$/u.test(mode[2])) { out[i] = `${mode[1]}blocking${mode[3]}${lines[i].slice(body.length)}`; modeEdited = true; }
    else if (type && type[2].replace(/["']/gu, "") !== "automated") out[i] = `${type[1]}automated${type[3]}${lines[i].slice(body.length)}`;
  }
  return modeEdited ? finish(out.join("")) : refusal("gates.security has no plain `mode: off` line to change; set it to mode: blocking, type: automated by hand");
}

/** The manifest files to edit: every existing tier (a twin pair gets the same edit), else the one path the loader would read. */
function manifestTargets(root) {
  const existing = [NEUTRAL_MANIFEST, LEGACY_MANIFEST].filter((rel) => existsSync(join(root, rel)));
  return existing.length > 0 ? existing : [resolveAuthorityArtifactPath("manifest", { rootDir: root }).relPath];
}

/** Plans, validates and only then writes. Returns {status: "configured"|"unchanged"|"refused", files, reason?}. */
export function configureSecurityGate(root) {
  const plans = [];
  for (const rel of manifestTargets(root)) {
    const path = join(root, rel);
    let before = null;
    if (existsSync(path)) {
      const info = lstatSync(path);
      if (info.isSymbolicLink() || !info.isFile()) return { status: "refused", files: [], reason: `${rel} is not a regular file` };
      before = readFileSync(path, "utf8");
    }
    const result = before === null
      ? configureManifestText("schema: pipeline.manifest.v0\n", root)
      : configureManifestText(before, root);
    if (result.refusal) return { status: "refused", files: [], reason: `${rel}: ${result.refusal}` };
    plans.push({ rel, path, before, result });
  }
  const changed = plans.filter((plan) => !plan.result.unchanged);
  if (changed.length === 0) return { status: "unchanged", files: plans.map((plan) => plan.rel), mode: plans[0].result.mode };
  for (const plan of changed) {
    mkdirSync(dirname(plan.path), { recursive: true });
    const temp = `${plan.path}.tmp-${process.pid}`;
    try { writeFileSync(temp, plan.result.text, { flag: "wx" }); renameSync(temp, plan.path); }
    catch (error) { rmSync(temp, { force: true }); return { status: "refused", files: [], reason: `${plan.rel} could not be written (${error instanceof Error ? error.message : String(error)})` }; }
  }
  return { status: "configured", files: changed.map((plan) => plan.rel) };
}

if (isDirectInvocation(import.meta.url)) {
  const args = process.argv.slice(2);
  const fail = (reason) => { console.error(`${SECURITY_GATE_CONFIGURE_REFUSED}: ${reason}; nothing was written.`); process.exit(1); };
  if (args.length !== 2 || args[0] !== "--root" || !isAbsolute(args[1] ?? "")) fail("usage: security-gate-configure.mjs --root <absolute project root>");
  let isDirectory = false;
  try { isDirectory = statSync(args[1]).isDirectory(); } catch { /* reported below */ }
  if (!isDirectory) fail("the root is not a directory");
  const result = configureSecurityGate(args[1]);
  if (result.status === "refused") fail(result.reason);
  if (result.status === "unchanged") {
    console.log(`security gate: already configured (mode ${result.mode}) in ${result.files.join(", ")} -- nothing changed.`);
  } else {
    console.log(`security gate: configured in ${result.files.join(", ")} (gates.security mode: blocking, type: automated). Run the check that refused again: it now runs the scanners.`);
  }
}
