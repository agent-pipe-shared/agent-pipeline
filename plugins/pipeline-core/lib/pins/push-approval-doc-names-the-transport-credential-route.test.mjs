// SPDX-License-Identifier: SUL-1.0
/**
 * Pin for pipeline.greenfield.g16-credential-selection-configured-route (G16, D209).
 * Acceptance: (A1) the push-approval reference separates the Git transport credential from the PO
 * approval proof; (A2) it names the configured route (remote URL, ssh -G, credential helper);
 * (A3) it forbids listing a credential store and guessing key filenames and asks the PO one
 * question instead; (A4) the shipped push-release flow names the same route and points at the
 * reference; (A5) the source copy carries the same paragraph (only where docs/ exists).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..", "..");
const reference = readFileSync(resolve(pluginRoot, "skills/pipeline-start/references/push-approval.md"), "utf8");
const flowPath = resolve(pluginRoot, "docs/push-release-flow.md");
const sourceFlowPath = resolve(pluginRoot, "..", "..", "docs/push-release-flow.md");
const HEADING = "Git transport credentials are not the PO approval proof";

const section = (text, heading) => {
  const start = text.indexOf(`### ${heading}`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const next = text.indexOf("\n### ", start + 4);
  return text.slice(start, next === -1 ? undefined : next);
};

test("A1 the reference separates the transport credential from the approval proof", () => {
  const body = section(reference, HEADING);
  assert.match(body, /PO approval proof/u);
  assert.match(body, /Git transport credential/u);
  assert.match(body, /never needs to read, choose or name the transport\s+credential/u);
});

test("A2 the reference names the configured route", () => {
  const body = section(reference, HEADING);
  for (const route of ["git remote get-url <remote>", "ssh -G <host>", "git config --get credential.helper"]) {
    assert.ok(body.includes(route), `route not named: ${route}`);
  }
});

test("A3 no store listing, no guessed filenames, one early PO question", () => {
  const body = section(reference, HEADING);
  assert.match(body, /Never list a\s+credential store/u);
  assert.match(body, /never guess\s+key filenames/u);
  assert.match(body, /ask the PO \*\*one\*\* question with context, early/u);
});

test("A5 the source push-release flow carries the same paragraph as the shipped copy", { skip: !existsSync(sourceFlowPath) && "no source docs/ in this checkout" }, () => {
  const marker = "**The Git transport credential is not the PO approval proof.**";
  const paragraph = (text) => text.slice(text.indexOf(marker), text.indexOf("\n\n", text.indexOf(marker)));
  assert.equal(paragraph(readFileSync(sourceFlowPath, "utf8")), paragraph(readFileSync(flowPath, "utf8")));
});

test("A4 the shipped push-release flow names the same route and points at the reference", () => {
  const flow = readFileSync(flowPath, "utf8");
  assert.match(flow, /The Git transport credential is not the PO approval proof/u);
  for (const route of ["git remote get-url <remote>", "ssh -G <host>", "git config --get credential.helper"]) {
    assert.ok(flow.includes(route), `route not named in the flow: ${route}`);
  }
  assert.ok(flow.includes(HEADING), "the flow does not point at the reference section");
});
