// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  REQUIREMENT_TRACEABILITY_SCHEMA,
  RequirementTraceabilityError,
  evaluateRequirementTraceability,
  requirementMapPath,
} from "./requirement-traceability.mjs";

const candidate = { commit: "a".repeat(40), tree: "b".repeat(40) };
const specBytes = Buffer.from("# Spec\n\nThe game should feel delightful.\n");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function evaluate(files, map) {
  const all = new Map(Object.entries({
    "specs/game/spec.md": specBytes,
    "specs/game/spec.requirements.json": Buffer.from(`${JSON.stringify(map)}\n`),
    ...files,
  }));
  const inventory = new Map([...all].map(([path, bytes], index) => [path, {
    path, blobOid: String(index + 1).padStart(40, "a"), mode: "100644", readable: true, bytes,
  }]));
  return evaluateRequirementTraceability({
    specPath: "specs/game/spec.md",
    candidate,
    candidateFiles: inventory,
    readCandidateFile: (path) => inventory.get(path).bytes,
  });
}
function map(criteria) { return { schema: REQUIREMENT_TRACEABILITY_SCHEMA, specPath: "specs/game/spec.md", specSha256: digest(specBytes), criteria }; }

test("an absent map keeps undeclared feature packages on the existing path", () => {
  const files = new Map([["specs/game/spec.md", { mode: "100644", readable: true }]]);
  const result = evaluateRequirementTraceability({ specPath: "specs/game/spec.md", candidate, candidateFiles: files, readCandidateFile() {} });
  assert.equal(result.mode, "undeclared");
  assert.deepEqual(result.criteria, []);
  assert.equal(requirementMapPath("specs/game/spec.md"), "specs/game/spec.requirements.json");
});

test("reports keyboard handler and sound toggle independently while ignoring subjective Spec prose", () => {
  const criteria = [
    { id: "AC-KEYBOARD", predicate: "file-contains-literal", path: "src/game.js", literal: "keydown" },
    { id: "AC-SOUND-TOGGLE", predicate: "file-contains-literal", path: "index.html", literal: "data-action=\"sound-toggle\"" },
  ];
  const result = evaluate({
    "src/game.js": Buffer.from("addEventListener('keydown', movePlayer);\n"),
    "index.html": Buffer.from("<button>Play</button>\n"),
  }, map(criteria));
  assert.deepEqual(result.criteria.map(({ id, status }) => ({ id, status })), [
    { id: "AC-KEYBOARD", status: "present" },
    { id: "AC-SOUND-TOGGLE", status: "absent" },
  ]);
  assert.deepEqual(result.missingCriteria, [{ id: "AC-SOUND-TOGGLE", predicate: "file-contains-literal", path: "index.html" }]);
  assert.equal(result.criteria.some(({ id }) => id.includes("DELIGHT")), false, "subjective prose outside the closed map is ignored");
});

test("accepts both named fixture requirements when their literal artifacts are present", () => {
  const result = evaluate({
    "src/game.js": Buffer.from("window.addEventListener(\"keydown\", onKey);\n"),
    "index.html": Buffer.from("<button data-action=\"sound-toggle\">Sound</button>\n"),
  }, map([
    { id: "AC-KEYBOARD", predicate: "file-contains-literal", path: "src/game.js", literal: "keydown" },
    { id: "AC-SOUND-TOGGLE", predicate: "file-contains-literal", path: "index.html", literal: "data-action=\"sound-toggle\"" },
  ]));
  assert.equal(result.missingCriteria.length, 0);
  assert.ok(result.criteria.every(({ status }) => status === "present"));
});

test("rejects a stale map when the exact candidate Spec bytes changed", () => {
  const stale = map([{ id: "AC-KEYBOARD", predicate: "file-contains-literal", path: "src/game.js", literal: "keydown" }]);
  const all = new Map([
    ["specs/game/spec.md", { readable: true, blobOid: "a".repeat(40), bytes: Buffer.from("# Spec\n\nNew AC: sound toggle\n") }],
    ["specs/game/spec.requirements.json", { readable: true, blobOid: "b".repeat(40), bytes: Buffer.from(JSON.stringify(stale)) }],
    ["src/game.js", { readable: true, blobOid: "c".repeat(40), bytes: Buffer.from("keydown") }],
  ]);
  assert.throws(() => evaluateRequirementTraceability({
    specPath: "specs/game/spec.md", candidate, candidateFiles: all, readCandidateFile: (path) => all.get(path).bytes,
  }), (error) => error.code === "RT-MAP-SPEC-DIGEST");
});

test("refuses unknown predicates, extra keys, traversal, duplicate ids, and symlink targets", () => {
  for (const criterion of [
    { id: "AC-CMD", predicate: "run-command", path: "src/game.js", command: "node test.js" },
    { id: "AC-EXTRA", predicate: "path-exists", path: "src/game.js", note: "trust me" },
    { id: "AC-ESCAPE", predicate: "path-exists", path: "../secret" },
  ]) {
    assert.throws(() => evaluate({ "src/game.js": Buffer.from("ok") }, map([criterion])), RequirementTraceabilityError);
  }
  assert.throws(() => evaluate({}, map([
    { id: "AC-DUP", predicate: "path-exists", path: "a" },
    { id: "AC-DUP", predicate: "path-exists", path: "b" },
  ])), (error) => error.code === "RT-CRITERION-ID");

  const resultMap = map([{ id: "AC-LINK", predicate: "path-exists", path: "src/link.js" }]);
  const mapBytes = Buffer.from(JSON.stringify(resultMap));
  const inventory = new Map([
    ["specs/game/spec.md", { mode: "100644", readable: true, blobOid: "d".repeat(40), bytes: specBytes }],
    ["specs/game/spec.requirements.json", { mode: "100644", readable: true, blobOid: "a".repeat(40), bytes: mapBytes }],
    ["src/link.js", { mode: "120000", readable: false, blobOid: "b".repeat(40), bytes: Buffer.from("outside") }],
  ]);
  assert.throws(() => evaluateRequirementTraceability({
    specPath: "specs/game/spec.md", candidate, candidateFiles: inventory, readCandidateFile: (path) => inventory.get(path).bytes,
  }), (error) => error.code === "RT-TARGET-FILE");
});
