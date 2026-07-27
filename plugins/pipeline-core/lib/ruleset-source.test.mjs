#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import {
  RULESET_SOURCE_SCHEMA,
  compareLoadedRulesetIdentity,
  normalizeRulesetSource,
  validateRulesetSource,
} from "./ruleset-source.mjs";

let pass = 0;
const failures = [];
function record(id, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS  ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.log(`FAIL  ${id} -- ${detail}`);
  }
}

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
function observation(overrides = {}) {
  return {
    schema: RULESET_SOURCE_SCHEMA,
    runner: "codex",
    selectedPlugin: { id: "pipeline-core@agent-pipeline", version: "0.4.6+codex.1" },
    source: { class: "marketplace-public" },
    loadedIdentity: { status: "available", algorithm: "git-sha1", value: SHA },
    installedIdentity: { status: "available", algorithm: "git-sha1", value: SHA },
    ...overrides,
  };
}

for (const [runner, sourceClass] of [
  ["claude", "marketplace-public"],
  ["codex", "marketplace-public"],
  ["agy", "marketplace-public"],
  ["codex", "self-application"],
  ["codex", "local-development"],
]) {
  const normalized = normalizeRulesetSource(observation({ runner, source: { class: sourceClass } }));
  record(
    `runner-neutral-${runner}-${sourceClass}`,
    normalized.status === "ready" && normalized.observation?.runner === runner && normalized.observation.source.class === sourceClass,
    JSON.stringify(normalized),
  );
}

{
  const result = validateRulesetSource(observation({ unexpectedAdapterCoordinate: "/home/private/cache" }));
  record("closed-unknown-adapter-key", !result.valid && result.errors.includes("observation-unknown-field"), JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ selectedPlugin: { id: "pipeline-core", version: "/home/private/token" } }));
  record("private-coordinate-rejected", result.status === "invalid-source-observation" && !JSON.stringify(result).includes("/home/private/token"), JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ source: { class: "marketplace-private", remote: "ssh://private" } }));
  record("private-remote-rejected", result.status === "invalid-source-observation" && !JSON.stringify(result).includes("ssh://private"), JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ source: { class: "marketplace-private" } }));
  record("private-classification-preserved", result.status === "ready" && result.observation.source.class === "marketplace-private", JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ source: { class: "local-development" } }));
  record("local-classification-preserved", result.status === "ready" && result.observation.source.class === "local-development", JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ source: { class: "unavailable" } }));
  record("source-unavailable-typed", result.status === "source-unavailable" && result.observation !== null, JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ loadedIdentity: { status: "unavailable" } }));
  record("loaded-unavailable-typed", result.status === "loaded-identity-unavailable", JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ installedIdentity: { status: "unavailable" } }));
  record("installed-unavailable-typed", result.status === "installed-identity-unavailable", JSON.stringify(result));
}
{
  const result = normalizeRulesetSource(observation({ installedIdentity: { status: "available", algorithm: "git-sha1", value: OTHER_SHA } }));
  record("loaded-installed-mismatch-typed", result.status === "loaded-installed-mismatch", JSON.stringify(result));
}
{
  const equal = compareLoadedRulesetIdentity(observation(), { status: "available", algorithm: "git-sha1", value: SHA });
  const mismatch = compareLoadedRulesetIdentity(observation(), { status: "available", algorithm: "git-sha1", value: OTHER_SHA });
  record(
    "equality-binds-exact-identities",
    equal.status === "equal" && equal.observation.loadedIdentity.value === SHA && equal.remoteIdentity?.value === SHA
      && mismatch.status === "loaded-remote-mismatch" && mismatch.remoteIdentity?.value === OTHER_SHA,
    `equal=${JSON.stringify(equal)} mismatch=${JSON.stringify(mismatch)}`,
  );
}
{
  const result = compareLoadedRulesetIdentity(observation(), { status: "unavailable" });
  record("remote-unavailable-typed", result.status === "remote-identity-unavailable" && result.remoteIdentity === null, JSON.stringify(result));
}

const total = pass + failures.length;
console.log(`\n${pass}/${total} cases passed.`);
if (failures.length > 0) {
  console.log("Failures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
