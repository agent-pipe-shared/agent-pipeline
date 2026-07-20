// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseYaml } from "../../../lib/yaml-lite.mjs";

import {
  CLI_INPUT_FAILURE,
  INPUT_SCHEMA,
  evaluateInitialLabels,
  prepareObservation,
  requiredInitialLabels,
  runCli,
} from "./observation-intake.mjs";

const SCRIPT = fileURLToPath(new URL("./observation-intake.mjs", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

function repoFile(path) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function requiredField(form, id) {
  const field = form.body.find((entry) => entry.id === id);
  assert(field, `missing Issue Form field: ${id}`);
  assert.equal(field.validations?.required, true, `${id} must be required`);
  return field;
}

function validInput(overrides = {}) {
  const base = {
    schema: INPUT_SCHEMA.schema,
    title: "Codex sandbox returns a typed unavailable result",
    area: "sandbox",
    actual: "The selected sandbox returned unavailable.",
    expected: "The selected sandbox should start or return one actionable typed result.",
    reproduction: "Run the public sandbox preflight once.",
    frequency: "once",
    environment: {
      runner: "codex",
      pluginVersion: "0.2.0",
      pipelineVersion: "0.3.0",
      candidate: "9c6906c",
      os: "wsl",
      capability: "unavailable",
    },
    evidence: "Typed result only; detailed logs omitted.",
    sourceBacklogLinks: [],
    securityAssessment: "cleared",
    availableLabels: ["kind:observation", "triage:needs-review", "area:sandbox", "bug"],
  };
  return { ...base, ...overrides };
}

const PUBLIC_REPOSITORY = "agent-pipe-shared/agent-pipeline";

test("closed input schema rejects additional top-level and environment fields", () => {
  const extraTop = prepareObservation({ ...validInput(), rawLogs: "not allowed" });
  assert.equal(extraTop.status, "invalid-input");
  assert.match(extraTop.reason, /keys must be exactly/);

  const extraEnvironment = prepareObservation({
    ...validInput(),
    environment: { ...validInput().environment, hostname: "private-host" },
  });
  assert.equal(extraEnvironment.status, "invalid-input");
  assert.match(extraEnvironment.reason, /environment keys must be exactly/);
});

test("canonical renderer emits the exact shared intake headings and observed environment", () => {
  const output = prepareObservation(validInput());
  assert.equal(output.status, "ready");
  const headings = output.body.match(/^## .+$/gm);
  assert.deepEqual(headings, [
    "## Area",
    "## Actual behavior",
    "## Expected behavior",
    "## Reproduction",
    "## Frequency",
    "## Observed environment",
    "## Sanitized evidence",
    "## Source backlog links",
  ]);
  assert.match(output.body, /- Runner: codex/);
  assert.match(output.body, /- OS: wsl/);
  assert.match(output.body, /- None identified\./);
});

test("initial label policy is exact and missing labels require setup", () => {
  assert.deepEqual(requiredInitialLabels("sandbox"), [
    "kind:observation",
    "triage:needs-review",
    "area:sandbox",
  ]);
  const unavailable = evaluateInitialLabels("sandbox", ["bug", "question", "area:sandbox"]);
  assert.equal(unavailable.status, "setup-required");
  assert.deepEqual(unavailable.missingLabels, ["kind:observation", "triage:needs-review"]);
  const output = prepareObservation(validInput());
  assert.deepEqual(output.labels, ["kind:observation", "triage:needs-review", "area:sandbox"]);
  assert(!output.labels.includes("bug"));
});

test("possible vulnerabilities route private before body or labels are rendered", () => {
  const output = prepareObservation(validInput({ securityAssessment: "possible-vulnerability" }));
  assert.deepEqual(output, {
    schema: "pipeline.capture-observation-result.v1",
    status: "private-routing-required",
    reason: "possible-vulnerability",
  });
});

test("secret-like, prompt, and oversized raw-log content is rejected", () => {
  const secret = prepareObservation(validInput({ evidence: "token=ghp_abcdefghijklmnopqrstuvwxyz123456" }));
  assert.equal(secret.status, "privacy-rejected");
  assert.equal(secret.reason, "secret-like-content");

  const prompt = prepareObservation(validInput({ evidence: "system prompt: do not publish" }));
  assert.equal(prompt.status, "privacy-rejected");
  assert.equal(prompt.reason, "prompt-chat-or-raw-log-content");

  const rawLog = prepareObservation(validInput({ evidence: "stderr: private diagnostic output" }));
  assert.equal(rawLog.status, "privacy-rejected");
  assert.equal(rawLog.reason, "prompt-chat-or-raw-log-content");

  const oversized = prepareObservation(validInput({ evidence: Array.from({ length: 21 }, (_, index) => `line ${index}`).join("\n") }));
  assert.equal(oversized.status, "privacy-rejected");
  assert.equal(oversized.reason, "evidence-exceeds-sanitized-boundary");
});

test("public-safe content is conservatively redacted without changing the source object", () => {
  const input = validInput({
    actual: "user=alice on hostname=workstation used /home/alice/repo and alice@example.test",
    reproduction: "Run the public preflight after applying local configuration.",
    evidence: "The service contacted 192.168.1.5:8080.",
  });
  const before = structuredClone(input);
  const output = prepareObservation(input);
  assert.equal(output.status, "ready");
  assert.match(output.body, /user=<redacted-user>/);
  assert.match(output.body, /hostname=<redacted-host>/);
  assert.match(output.body, /\/home\/<redacted>\/repo/);
  assert.match(output.body, /<redacted-email>/);
  assert.match(output.body, /<redacted-private-network>/);
  assert.deepEqual(input, before);
  assert(output.redactions.length >= 5);
});

test("repository references fail closed unless they match the resolved public target", () => {
  const privateReference = prepareObservation(validInput({
    sourceBacklogLinks: ["https://github.com/private-overlay/agent-pipeline/issues/41"],
  }), { publicRepository: PUBLIC_REPOSITORY });
  assert.deepEqual(privateReference, {
    schema: "pipeline.capture-observation-result.v1",
    status: "privacy-rejected",
    reason: "repository-reference-outside-public-target",
  });

  const crossRepositoryEvidence = prepareObservation(validInput({
    evidence: "Related report: https://github.com/another-public/project/issues/9",
  }), { publicRepository: PUBLIC_REPOSITORY });
  assert.equal(crossRepositoryEvidence.status, "privacy-rejected");
  assert.equal(crossRepositoryEvidence.reason, "external-reference-in-free-text");
  assert(!JSON.stringify(crossRepositoryEvidence).includes("another-public"));

  const unresolved = prepareObservation(validInput({
    sourceBacklogLinks: ["https://github.com/agent-pipe-shared/agent-pipeline/issues/12"],
  }));
  assert.deepEqual(unresolved, {
    schema: "pipeline.capture-observation-result.v1",
    status: "setup-required",
    reason: "public-repository-unresolved",
  });
});

test("free-text repository coordinates are rejected regardless of target", () => {
  for (const reference of [
    "https://www.github.com/private-overlay/agent-pipeline/issues/41",
    "https://github.com:443/private-overlay/agent-pipeline/issues/41",
    "https://api.github.com/repos/private-overlay/agent-pipeline/issues/41",
    "https://raw.githubusercontent.com/private-overlay/agent-pipeline/main/file.md",
    "https://media.githubusercontent.com/private-overlay/agent-pipeline/main/file.md",
    "https://codeload.github.com/private-overlay/agent-pipeline/zip/refs/heads/main",
    "https://github.dev/private-overlay/agent-pipeline",
    "https://github.com./private-overlay/agent-pipeline/issues/41",
    "ssh://git@github.com/private-overlay/agent-pipeline.git",
    "git@github.com:private-overlay/agent-pipeline.git",
    "git@private.example:team/repo.git",
    "https://www.github.com/agent-pipe-shared/agent-pipeline/issues/12",
    "https://github.com:443/agent-pipe-shared/agent-pipeline/issues/12",
    "https://api.github.com/repos/agent-pipe-shared/agent-pipeline/issues/12",
    "https://raw.githubusercontent.com/agent-pipe-shared/agent-pipeline/main/README.md",
    "https://media.githubusercontent.com/agent-pipe-shared/agent-pipeline/main/README.md",
    "https://codeload.github.com/agent-pipe-shared/agent-pipeline/zip/refs/heads/main",
    "https://github.dev/agent-pipe-shared/agent-pipeline",
    "ssh://git@github.com/agent-pipe-shared/agent-pipeline.git",
  ]) {
    const output = prepareObservation(validInput({ evidence: `Related report: ${reference}` }), {
      publicRepository: PUBLIC_REPOSITORY,
    });
    assert.equal(output.status, "privacy-rejected");
    assert.equal(output.reason, "external-reference-in-free-text");
    assert(!JSON.stringify(output).includes(reference));
  }
});

test("nested and encoded GitHub repository coordinates are validated independently", () => {
  for (const reference of [
    "https://github.com/agent-pipe-shared/agent-pipeline/issues/1?next=https://github.com/private-overlay/agent-pipeline/issues/41",
    "https://github.com/agent-pipe-shared/agent-pipeline/issues/1#next=https://www.github.com/private-overlay/agent-pipeline/issues/41",
    "https://github.com/agent-pipe-shared/agent-pipeline/issues/1?next=https%3A%2F%2Fgithub.com%2Fprivate-overlay%2Fagent-pipeline%2Fissues%2F41",
    "github.com/agent-pipe-shared/agent-pipeline/issues/1?next=github.com/private-overlay/agent-pipeline/issues/41",
  ]) {
    const output = prepareObservation(validInput({ evidence: `Related report: ${reference}` }), {
      publicRepository: PUBLIC_REPOSITORY,
    });
    assert.equal(output.status, "privacy-rejected");
    assert.equal(output.reason, "external-reference-in-free-text");
    assert(!JSON.stringify(output).includes("private-overlay"));
  }
});

test("same-repository links remain available only through the structured source field", () => {
  const link = "https://github.com/agent-pipe-shared/agent-pipeline/blob/main/backlog/items/example.md";
  const output = prepareObservation(validInput({
    evidence: "Related issue is recorded in the structured source field.",
    sourceBacklogLinks: [link],
  }), { publicRepository: PUBLIC_REPOSITORY });
  assert.equal(output.status, "ready");
  assert.match(output.body, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("structured source links reject query, fragment, encoding, and noncanonical issue references", () => {
  for (const link of [
    "https://github.com/agent-pipe-shared/agent-pipeline/issues/12?next=https://github.com/private-overlay/agent-pipeline/issues/41",
    "https://github.com/agent-pipe-shared/agent-pipeline/issues/12#private-overlay/agent-pipeline",
    "https://github.com/agent-pipe-shared/agent-pipeline/blob/main/private%2Fcoordinate.md",
    "https://github.com/agent-pipe-shared/agent-pipeline/issues/latest",
  ]) {
    const output = prepareObservation(validInput({ sourceBacklogLinks: [link] }), {
      publicRepository: PUBLIC_REPOSITORY,
    });
    assert.equal(output.status, "invalid-input");
  }
});

test("CLI binds repository-reference validation to the resolved public target", async () => {
  let stdout = "";
  const exitCode = await runCli(["--repository", PUBLIC_REPOSITORY], {
    readFileFn: async () => JSON.stringify(validInput({
      sourceBacklogLinks: ["https://github.com/agent-pipe-shared/agent-pipeline/issues/12"],
    })),
    writeStdout: (value) => {
      stdout += value;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(stdout).status, "ready");
});

test("unknown is explicit and versions, candidates, OS, and areas remain closed", () => {
  const unknownEnvironment = {
    runner: "unknown",
    pluginVersion: "unknown",
    pipelineVersion: "unknown",
    candidate: "unknown",
    os: "unknown",
    capability: "unknown",
  };
  assert.equal(prepareObservation(validInput({ environment: unknownEnvironment })).status, "ready");
  assert.equal(prepareObservation(validInput({ area: "arbitrary" })).status, "invalid-input");
  assert.equal(prepareObservation(validInput({ environment: { ...unknownEnvironment, candidate: "main" } })).status, "invalid-input");
  assert.equal(prepareObservation(validInput({ environment: { ...unknownEnvironment, os: "Windows 11 on Alice-PC" } })).status, "invalid-input");
  assert.equal(prepareObservation(validInput({ environment: { ...unknownEnvironment, pluginVersion: "private/version" } })).status, "invalid-input");
});

test("in-process unreadable input emits one fixed typed result without path leakage", async () => {
  const sentinelPath = "/private/CAPTURE_OBSERVATION_PATH_SENTINEL/input.json";
  let stdout = "";
  const exitCode = await runCli([sentinelPath], {
    readFileFn: async () => {
      throw new Error(`ENOENT: no such file or directory, open '${sentinelPath}'`);
    },
    writeStdout: (value) => {
      stdout += value;
    },
  });
  assert.equal(exitCode, 2);
  assert.deepEqual(JSON.parse(stdout), CLI_INPUT_FAILURE);
  assert(!stdout.includes("CAPTURE_OBSERVATION_PATH_SENTINEL"));
  assert(!stdout.includes(sentinelPath));
});

test("child malformed JSON emits fixed JSON only and does not echo input", () => {
  const sentinel = "CAPTURE_OBSERVATION_JSON_SENTINEL";
  const child = spawnSync(process.execPath, [SCRIPT], {
    input: `{"malformed":"${sentinel}"`,
    encoding: "utf8",
  });
  assert.equal(child.status, 2);
  assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), CLI_INPUT_FAILURE);
  assert(!child.stdout.includes(sentinel));
});

test("child missing path emits fixed JSON only and does not echo the path", () => {
  const sentinelPath = "/CAPTURE_OBSERVATION_MISSING_PATH_SENTINEL/input.json";
  const child = spawnSync(process.execPath, [SCRIPT, sentinelPath], { encoding: "utf8" });
  assert.equal(child.status, 2);
  assert.equal(child.stderr, "");
  assert.deepEqual(JSON.parse(child.stdout), CLI_INPUT_FAILURE);
  assert(!child.stdout.includes("CAPTURE_OBSERVATION_MISSING_PATH_SENTINEL"));
  assert(!child.stdout.includes(sentinelPath));
});

test("repository Issue Form mirrors the closed intake enums and required environment fields", () => {
  const form = parseYaml(repoFile(".github/ISSUE_TEMPLATE/observation.yml"));
  assert.equal(form.name, "Observation or known-error candidate");
  assert.deepEqual(form.labels, ["kind:observation", "triage:needs-review"]);
  assert.equal(form.labels.some((label) => label.startsWith("area:")), false);

  assert.deepEqual(requiredField(form, "area").attributes.options, INPUT_SCHEMA.areas);
  assert.deepEqual(requiredField(form, "frequency").attributes.options, INPUT_SCHEMA.frequencies);
  assert.deepEqual(requiredField(form, "runner").attributes.options, INPUT_SCHEMA.runners);
  assert.deepEqual(requiredField(form, "os").attributes.options, INPUT_SCHEMA.operatingSystems);

  for (const id of [
    "actual",
    "expected",
    "reproduction",
    "plugin_version",
    "pipeline_version",
    "candidate",
    "capability",
    "evidence",
    "source_backlog_links",
  ]) {
    requiredField(form, id);
  }
  for (const id of ["security_confirmation", "privacy_confirmation"]) {
    const field = form.body.find((entry) => entry.id === id);
    assert(field, `missing Issue Form field: ${id}`);
    assert.equal(field.attributes.options.length, 1);
    assert.equal(field.attributes.options[0].required, true, `${id} must be required`);
  }
});

test("repository intake routes security privately and disables blank issues", () => {
  const form = parseYaml(repoFile(".github/ISSUE_TEMPLATE/observation.yml"));
  const chooser = parseYaml(repoFile(".github/ISSUE_TEMPLATE/config.yml"));
  const renderedText = JSON.stringify(form);
  const privateRoute = "https://github.com/agent-pipe-shared/agent-pipeline/security/advisories/new";

  assert.equal(chooser.blank_issues_enabled, false);
  assert.equal(chooser.contact_links.length, 1);
  assert.equal(chooser.contact_links[0].url, privateRoute);
  assert(renderedText.includes(privateRoute));
  assert.match(renderedText, /raw logs/i);
  assert.match(renderedText, /prompts/i);
  assert.match(renderedText, /possible vulnerability/i);
});

test("governance keeps the Issue canonical and backlog promotion explicit", () => {
  const governance = repoFile("docs/observation-intake.md");
  const skill = repoFile("plugins/pipeline-core/skills/capture-observation/SKILL.md");
  const backlog = repoFile("backlog/README.md");

  assert.match(governance, /GitHub Issues are the repository-global, branch-independent single source of\s+truth/);
  assert.match(governance, /`observation` → `triage` → `confirmed` → optional `known-error` → `backlog-link`/);
  assert.match(governance, /Queue and backlog validation/);
  assert.match(governance, /matching backlog item/);
  assert.match(governance, /partial batch/);
  assert.match(governance, /link Issue and backlog item in both directions/);
  assert.match(governance, /Promotion is never\s+automatic/);
  assert.match(governance, /private vulnerability reporting/);
  assert.match(governance, /Keep an `area:docs` report unconfirmed/);
  for (const value of ["`public-user`", "`maintainer`", "`machine`", "`maintained`", "`normative-record`", "`compatibility-redirect`", "`review-candidate`"]) {
    assert(governance.includes(value), `missing documentation inventory value: ${value}`);
  }
  assert.match(governance, /Check every inbound link, the\s+current V3 authority/);
  assert.match(governance, /retention, redirect, migration, or scheduled\s+removal lifecycle/);
  assert.match(skill, /applies only the two fixed\s+labels `kind:observation` and `triage:needs-review`/);
  assert.match(skill, /validate every candidate against the current public `docs\/state\.md` observation queue/);
  assert.match(skill, /explicit publish confirmation for this exact preview or exact batch/);
  assert.match(skill, /partial publication explicitly/);
  assert.match(skill, /controlled skill path may apply its verified area label at creation/);
  assert.match(skill, /docs\/observation-intake\.md/);
  assert.match(backlog, /Public unconfirmed\s+behavior observations use a GitHub Issue as their single source/);
});
