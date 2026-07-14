import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkCriticFailClosedContract, validateCriticReferences } from "./check-critic-fail-closed.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`ok ${passed} - ${name}\n`); }

const valid = [
  { kind: "spec", availability: "available" },
  { kind: "diff", availability: "available" },
  { kind: "guardrail", availability: "available" },
  { kind: "evidence", availability: "available" },
  { kind: "metadata", availability: "available" },
];

check("admissible reference-only input proceeds", () => {
  assert.deepEqual(validateCriticReferences(valid), { ok: true, action: "review" });
});
for (const [name, references, category] of [
  ["missing required artifact", valid.map((item) => item.kind === "evidence" ? { ...item, availability: "missing" } : item), "missing-required-artifact"],
  ["unreadable required artifact", valid.map((item) => item.kind === "spec" ? { ...item, availability: "unreadable" } : item), "unreadable-required-artifact"],
  ["undeclared required category", valid.filter((item) => item.kind !== "guardrail"), "missing-required-artifact"],
  ["ambiguous reference", valid.map((item) => item.kind === "diff" ? { ...item, availability: "unknown" } : item), "ambiguous-required-artifact"],
  ["outside boundary reference", [...valid, { kind: "other", availability: "available" }], "outside-declared-boundary"],
  ["copied content rejects without consumption", [...valid, { kind: "evidence", availability: "available", content: "synthetic narrative" }], "forbidden-or-ambiguous-input"],
]) {
  check(`${name} stops with category only`, () => {
    const result = validateCriticReferences(references);
    assert.deepEqual(result, { ok: false, findingCategory: category, action: "stop" });
    assert.equal("content" in result, false);
  });
}
for (const kind of ["handover", "state", "history", "session", "chat", "implementor-explanation", "prior-verdict", "summary", "expectation", "replacement"]) {
  check(`forbidden ${kind} stops without narrative consumption`, () => {
    const result = validateCriticReferences([...valid, { kind, availability: "available" }]);
    assert.deepEqual(result, { ok: false, findingCategory: "forbidden-input", action: "stop" });
  });
}
check("declared two-file contract surface is valid", () => {
  const texts = {
    "roles/critic.md": readFileSync(join(root, "roles", "critic.md"), "utf8"),
    "templates/prompts/critic-review.md": readFileSync(join(root, "templates", "prompts", "critic-review.md"), "utf8"),
  };
  assert.equal(checkCriticFailClosedContract(texts).ok, true);
});
check("usage-comment rule cannot satisfy the copied prompt contract", () => {
  const prompt = readFileSync(join(root, "templates", "prompts", "critic-review.md"), "utf8");
  const delimiterAt = prompt.indexOf("COPY EVERYTHING BELOW THIS LINE\n-->");
  const corrupted = `${prompt.slice(0, delimiterAt)}${prompt.slice(delimiterAt).replace("CRITIC-FAIL-CLOSED: reference-only-stop", "removed")}`;
  assert.equal(checkCriticFailClosedContract({
    "roles/critic.md": readFileSync(join(root, "roles", "critic.md"), "utf8"),
    "templates/prompts/critic-review.md": corrupted,
  }).ok, false);
});
check("inline dispatch and claims placeholders fail closed", () => {
  const prompt = readFileSync(join(root, "templates", "prompts", "critic-review.md"), "utf8");
  const corrupted = prompt.replace("{{CLAIMS_EVIDENCE_PATH}}", "{{CLAIMS_PATH_OR_INLINE}}");
  assert.equal(checkCriticFailClosedContract({
    "roles/critic.md": readFileSync(join(root, "roles", "critic.md"), "utf8"),
    "templates/prompts/critic-review.md": corrupted,
  }).ok, false);
});
check("missing contract rule fails closed", () => {
  const texts = {
    "roles/critic.md": "CRITIC-FAIL-CLOSED: reference-only-stop\nsubstantive review stopped",
    "templates/prompts/critic-review.md": "CRITIC-FAIL-CLOSED: reference-only-stop\nsubstantive review stopped",
  };
  assert.equal(checkCriticFailClosedContract(texts).ok, false);
});
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
