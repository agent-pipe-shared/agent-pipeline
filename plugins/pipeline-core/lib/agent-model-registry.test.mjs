#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Regression suite for `agent-model-registry.mjs` (NVA-BL-78).
 *
 * Resolves against the REAL agent definition files under `plugins/pipeline-core/agents/` —
 * the whole point of this module is to read the definition that actually decides, so a fixture
 * copy would test a fixture rather than the thing in production. `goldfish-deep.md` carries
 * `model: sonnet` / `effort: xhigh` and `goldfish-implementor.md` carries `model: sonnet` /
 * `effort: medium` at the time this suite was written — exactly the pair the 2026-08-08 incident
 * confused (briefed "claude-opus-5 at xhigh", the agent definition says sonnet/xhigh).
 *
 * Run: node --test plugins/pipeline-core/lib/agent-model-registry.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MODEL_FAMILY_ALIASES,
  compareRecordedModel,
  modelBelongsToFamily,
  parseAgentFrontmatter,
  resolveAgentModel,
} from "./agent-model-registry.mjs";

test("parseAgentFrontmatter reads model/effort out of a real agent file's frontmatter", () => {
  const resolved = resolveAgentModel("goldfish-implementor");
  assert.deepEqual(resolved, { model: "sonnet", effort: "medium" });
});

test("resolveAgentModel resolves goldfish-deep to sonnet/xhigh -- the tier the incident confused for a different model", () => {
  const resolved = resolveAgentModel("goldfish-deep");
  assert.deepEqual(resolved, { model: "sonnet", effort: "xhigh" });
});

test("resolveAgentModel returns null for an unknown agent type, never throws", () => {
  assert.equal(resolveAgentModel("goldfish-nonexistent"), null);
  assert.equal(resolveAgentModel(""), null);
  assert.equal(resolveAgentModel(undefined), null);
});

test("resolveAgentModel refuses a path-shaped agentType rather than reading outside the agents dir", () => {
  assert.equal(resolveAgentModel("../../../etc/passwd"), null);
});

test("modelBelongsToFamily: a concrete claude-sonnet-* identifier belongs to the sonnet tier family", () => {
  assert.equal(modelBelongsToFamily("claude-sonnet-5", "sonnet"), true);
  assert.equal(modelBelongsToFamily("claude-opus-5", "sonnet"), false);
});

test("modelBelongsToFamily is the discriminating check the incident needed: opus vs. sonnet, xhigh unchanged", () => {
  // The exact incident shape: briefed "claude-opus-5 at xhigh" against a sonnet/xhigh agent.
  // Effort (xhigh) matches on both sides; model family is what silently diverged.
  assert.equal(modelBelongsToFamily("claude-opus-5", "sonnet"), false);
  assert.equal(MODEL_FAMILY_ALIASES.sonnet.includes("claude-sonnet"), true);
});

test("compareRecordedModel: no agentType -> silent (agent-type-absent), corpus-compatible with pre-NVA-BL-78 records", () => {
  const outcome = compareRecordedModel({ taskId: "OLD-1", model: "claude-opus-5", effort: "xhigh" });
  assert.equal(outcome.classification, "agent-type-absent");
});

test("compareRecordedModel: recorded model agrees with the resolved agent definition -> model-matches", () => {
  const outcome = compareRecordedModel({ agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium" });
  assert.equal(outcome.classification, "model-matches");
});

test("compareRecordedModel: recorded model reproduces the exact 2026-08-08 incident shape -> model-mismatch", () => {
  const outcome = compareRecordedModel({ agentType: "goldfish-deep", model: "claude-opus-5", effort: "xhigh" });
  assert.equal(outcome.classification, "model-mismatch");
  assert.match(outcome.reason, /goldfish-deep/u);
});

test("compareRecordedModel: a well-formed modelOverride is honoured and reported as an override, not a mismatch", () => {
  const outcome = compareRecordedModel({
    agentType: "goldfish-deep",
    model: "claude-opus-5",
    effort: "xhigh",
    modelOverride: { model: "claude-opus-5", effort: "xhigh", rationale: "MP-05 criterion 1: guardrail hook rewrite across two subsystems" },
  });
  assert.equal(outcome.classification, "model-override-declared");
});

test("compareRecordedModel: a modelOverride missing its rationale is NOT indistinguishable from a typo -- treated as a mismatch", () => {
  const outcome = compareRecordedModel({
    agentType: "goldfish-deep",
    model: "claude-opus-5",
    effort: "xhigh",
    modelOverride: { model: "claude-opus-5", effort: "xhigh" },
  });
  assert.equal(outcome.classification, "model-override-malformed");
});

test("compareRecordedModel: agentType present but unresolvable -> agent-definition-unresolved, not a fail", () => {
  const outcome = compareRecordedModel({ agentType: "goldfish-nonexistent", model: "claude-sonnet-5", effort: "medium" });
  assert.equal(outcome.classification, "agent-definition-unresolved");
});

test("parseAgentFrontmatter: no frontmatter block -> empty object, never throws", () => {
  assert.deepEqual(parseAgentFrontmatter("no frontmatter here"), {});
  assert.deepEqual(parseAgentFrontmatter(""), {});
});
