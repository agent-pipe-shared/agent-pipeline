#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import {
  checkRepository,
  collectAnchors,
  extractMarkdownLinks,
  isExcludedRepoPath,
  stripFencedCode,
} from "./check-doc-contracts.mjs";

const SCRIPT = new URL("./check-doc-contracts.mjs", import.meta.url).pathname;
const REPO = resolve(new URL("../..", import.meta.url).pathname);
const roots = [];

const STATEFUL_DESIGN_CONTRACTS = [
  {
    id: "authority-issuer-replay",
    template: "Authority issuer and replay rule.",
    elephant: "authority issuer and replay rule",
  },
  {
    id: "durable-storage-atomicity",
    template: "Durable storage and atomicity boundary.",
    elephant: "durable storage and atomicity",
  },
  {
    id: "crash-state-matrix",
    template: "Complete resource/phase crash-state matrix.",
    elephant: "complete resource/phase crash-state matrix",
  },
  {
    id: "mutation-enforcement",
    template: "Exact mutation point and kernel/controller enforcement point.",
    elephant: "exact mutation plus kernel/controller enforcement points",
  },
  {
    id: "bootstrap-self-update",
    template: "Bootstrap and self-update transition.",
    elephant: "bootstrap/self-update transition",
  },
  {
    id: "candidate-evidence-binding",
    template: "Binary candidate/evidence binding.",
    elephant: "binary candidate/evidence binding",
  },
  {
    id: "pre-post-bytes",
    template: "Exact pre- and post-mutation bytes.",
    elephant: "exact pre/post bytes",
  },
  {
    id: "sole-recovery-authority",
    template: "Sole recovery authority.",
    elephant: "sole recovery authority",
  },
  {
    id: "self-reference-audit",
    template: "Self-reference audit (what mutable material cannot authenticate itself).",
    elephant: "self-reference audit",
  },
];

function write(root, path, content) {
  const file = join(root, path);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "doc-contracts-"));
  roots.push(root);
  const files = {
    ".claude/pipeline.json": '{"handover":"docs/state.md"}\n',
    "CLAUDE.md": "# Rules\n\n[State](docs/state.md)\n",
    "docs/state.md": "# State\n\n[Calibration](../.claude/pipeline.json)\n",
    "README.md": "# Home\n\n[State](docs/state.md#state)\n",
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) {
    if (content !== null) write(root, path, content);
  }
  return { root, files };
}

function runFixture(root, extra = {}) {
  const trackedPaths = extra.trackedPaths ?? [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md"];
  const markdownPaths = extra.markdownPaths ?? trackedPaths.filter((path) => path.endsWith(".md"));
  return checkRepository(root, { trackedPaths, markdownPaths, readText: extra.readText });
}

test.after(() => {
  for (const root of roots) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

test("fenced code is removed without losing line structure", () => {
  const value = "ok\n```md\n[bad](missing.md)\n```\nend";
  assert.equal(stripFencedCode(value), "ok\n\n\n\nend");
});

test("anchors implement unicode, explicit ids, setext, and duplicate suffixes", () => {
  const anchors = collectAnchors("# Über & under\n# Repeat\n# Repeat-1\n# Repeat\nSetext\n---\n<a id=\"Exact-ID\"></a>\n");
  for (const anchor of ["über--under", "repeat", "repeat-1", "repeat-2", "setext", "Exact-ID", "exact-id"]) assert(anchors.has(anchor));
  const independent = collectAnchors('<a id="foo"></a>\n# Foo\n# Foo\n');
  assert(independent.has("foo"));
  assert(independent.has("foo-1"));
  assert(!independent.has("foo-2"));
});

test("inline and reference links are extracted while fenced fakes are ignored", () => {
  const links = extractMarkdownLinks(
    '[ref]: docs/state.md#state\n[A](README.md)\n[B][ref]\n[C](missing_(v1).md)\n[D](missing.md "Title")\n[E](<angle.md> \'Title\')\n```\n[X](missing.md)\n```\n',
  );
  assert.deepEqual(links.map((entry) => entry.destination), [
    "docs/state.md#state",
    "README.md",
    "docs/state.md#state",
    "missing_(v1).md",
    "missing.md",
    "angle.md",
  ]);
});

test("minimal repository passes", () => {
  const { root } = fixture();
  const result = runFixture(root);
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.statefulDesignContracts, "not-applicable");
});

test("missing file and missing anchor fail", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Missing](no.md) [Anchor](docs/state.md#absent)\n" });
  const reasons = runFixture(root).findings.join("\n");
  assert.match(reasons, /target is not tracked/);
  assert.match(reasons, /anchor not found/);
});

test("same-document fragments resolve against the source file", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Local](#home)\n" });
  assert.deepEqual(runFixture(root).findings, []);
});

test("external URLs are never fetched and directory links are accepted", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Web](https://invalid.example/x) [Docs](docs/)\n" });
  assert.deepEqual(runFixture(root).findings, []);
});

test("absolute and escaping paths fail closed", () => {
  const { root } = fixture({ "README.md": '# Home\n\n[A](/etc/passwd) [B](../outside.md "Title") [C](<../angle.md> \'Title\')\n' });
  const reasons = runFixture(root).findings.join("\n");
  assert.match(reasons, /absolute internal path/);
  assert.equal((reasons.match(/escapes repository root/g) ?? []).length, 2);
});

test("untracked Markdown sources are outside the exact-tree scan", () => {
  const { root } = fixture({ "scratch.md": Buffer.from([0xff, 0xfe]) });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "--", ".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md"], { cwd: root });
  const result = checkRepository(root);
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.markdownFiles, 3);
});

test("excluded instruction path is filtered before every source and target read", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Excluded](AGENTS.md)\n", "AGENTS.md": Buffer.from([0xff, 0xfe]) });
  const reads = [];
  const readText = (file) => {
    const rel = relative(root, file).split("\\").join("/");
    reads.push(rel);
    if (isExcludedRepoPath(rel)) throw new Error("forbidden read");
    return execFileSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1]))", file], { encoding: "utf8" });
  };
  const result = runFixture(root, {
    trackedPaths: [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md", "AGENTS.md"],
    markdownPaths: ["AGENTS.md", "CLAUDE.md", "docs/state.md", "README.md"],
    readText,
  });
  assert.deepEqual(result.findings, []);
  assert.equal(result.stats.excludedLinks, 1);
  assert(!reads.includes("AGENTS.md"));
});

test("internal symlink aliases cannot bypass the excluded instruction path", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Excluded](alias/AGENTS.md)\n", "AGENTS.md": Buffer.from([0xff, 0xfe]) });
  symlinkSync(".", join(root, "alias"));
  const reads = [];
  const readText = (file) => {
    const rel = relative(root, file).split("\\").join("/");
    reads.push(rel);
    if (rel.endsWith("AGENTS.md")) throw new Error("forbidden read");
    return execFileSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1]))", file], { encoding: "utf8" });
  };
  const result = runFixture(root, {
    trackedPaths: [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md", "alias/AGENTS.md"],
    readText,
  });
  assert.deepEqual(result.findings, []);
  assert(!reads.includes("alias/AGENTS.md"));
});

test("untracked targets fail even when present in the worktree", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Ghost](ghost.md)\n", "ghost.md": "# Ghost\n" });
  assert.match(runFixture(root).findings.join("\n"), /target is not tracked/);
});

test("invalid UTF-8 and injected reads fail closed", () => {
  const invalid = fixture({ "README.md": Buffer.from([0xff, 0xfe]) });
  const invalidResult = checkRepository(invalid.root, {
    trackedPaths: [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md"],
    markdownPaths: ["CLAUDE.md", "docs/state.md", "README.md"],
  });
  assert.match(invalidResult.findings.join("\n"), /source read failed/);
  const injected = fixture();
  const injectedResult = runFixture(injected.root, {
    readText(file) {
      if (file.endsWith("README.md")) throw new Error("simulated read failure");
      return execFileSync(process.execPath, ["-e", "process.stdout.write(require('fs').readFileSync(process.argv[1]))", file], { encoding: "utf8" });
    },
  });
  assert.match(injectedResult.findings.join("\n"), /simulated read failure/);
});

test("symlink targets escaping the repository fail closed", () => {
  const { root } = fixture({ "README.md": "# Home\n\n[Outside](outside.md)\n" });
  const external = mkdtempSync(join(tmpdir(), "doc-contracts-outside-"));
  roots.push(external);
  writeFileSync(join(external, "target.md"), "# Outside\n");
  symlinkSync(join(external, "target.md"), join(root, "outside.md"));
  assert.match(
    runFixture(root, { trackedPaths: [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md", "outside.md"] }).findings.join("\n"),
    /symlink target escapes repository root/,
  );
});

test("malformed, duplicate, and invalid handover calibration fail", () => {
  for (const calibration of [
    "{bad",
    '{"handover":"docs/state.md","nested":{"handover":"docs/state.md"}}',
    '{"handover":""}',
    '{"handover":"/docs/state.md"}',
    '{"handover":"../state.md"}',
    '{"handover":"docs\\\\state.md"}',
  ]) {
    const { root } = fixture({ ".claude/pipeline.json": `${calibration}\n` });
    assert.match(runFixture(root).findings.join("\n"), /authority:/);
  }
});

test("handover must be tracked regular Markdown and not a symlink", () => {
  const first = fixture();
  assert.match(runFixture(first.root, { trackedPaths: [".claude/pipeline.json", "CLAUDE.md", "README.md"] }).findings.join("\n"), /not tracked/);
  const second = fixture({ "docs/state.md": null, "docs/real.md": "# State\n" });
  symlinkSync("real.md", join(second.root, "docs/state.md"));
  assert.match(runFixture(second.root).findings.join("\n"), /symlink is not allowed/);
});

test("CLAUDE requires the calibrated state only and handover requires backlink", () => {
  const missing = fixture({ "CLAUDE.md": "# Rules\n" });
  assert.match(runFixture(missing.root).findings.join("\n"), /does not link/);
  const competing = fixture({ "CLAUDE.md": "# Rules\n[State](docs/state.md) [Other](other/state.md)\n", "other/state.md": "# Other\n" });
  assert.match(
    runFixture(competing.root, { trackedPaths: [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md", "other/state.md"] }).findings.join("\n"),
    /competing state/,
  );
  const noBacklink = fixture({ "docs/state.md": "# State\n" });
  assert.match(runFixture(noBacklink.root).findings.join("\n"), /does not link back/);
});

test("CLI fails closed when Git enumeration is unavailable", () => {
  const root = mkdtempSync(join(tmpdir(), "doc-contracts-no-git-"));
  roots.push(root);
  const result = spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /git ls-files failed/);
});

test("stateful design checklist is complete on both required documentation surfaces", () => {
  const baseline = checkRepository(REPO);
  assert.deepEqual(baseline.findings, []);
  assert.equal(
    baseline.stats.statefulDesignContracts,
    "checked",
    "the repository result must attest that both stateful-design documentation surfaces were checked",
  );

  for (const requirement of STATEFUL_DESIGN_CONTRACTS) {
    for (const [surface, phrase] of [
      ["templates/spec.md", requirement.template],
      ["roles/elephant.md", requirement.elephant],
    ]) {
      const result = checkRepository(REPO, {
        readText(file) {
          const text = readFileSync(file, "utf8");
          if (relative(REPO, file).split("\\").join("/") !== surface) return text;
          assert(text.includes(phrase), `${surface} fixture must contain ${requirement.id}`);
          return text.replace(phrase, `[intentionally omitted: ${requirement.id}]`);
        },
      });
      assert(
        result.findings.some((finding) => finding.includes(`stateful-design-contract: ${surface}: ${requirement.id}`)),
        `${surface} must reject an omitted ${requirement.id} checklist concept; got: ${result.findings.join(" | ")}`,
      );
    }
  }
});

const statefulDesignBaseTrackedPaths = [".claude/pipeline.json", "CLAUDE.md", "docs/state.md", "README.md"];

test("pipeline-shaped repositories require both stateful-design surfaces even when neither is tracked", () => {
  const { root } = fixture({ ".claude/pipeline.yaml": "schema: pipeline.manifest.v0\n" });
  const result = runFixture(root, { trackedPaths: [...statefulDesignBaseTrackedPaths, ".claude/pipeline.yaml"] });
  assert.deepEqual(
    result.findings.filter((finding) => finding.endsWith(": required-surface-missing")),
    [
      "stateful-design-contract: roles/elephant.md: required-surface-missing",
      "stateful-design-contract: templates/spec.md: required-surface-missing",
    ],
  );
  assert.equal(result.stats.statefulDesignContracts, "checked");
});

for (const [presentSurface, phraseKey] of [
  ["templates/spec.md", "template"],
  ["roles/elephant.md", "elephant"],
]) {
  test(`a generic repository ignores a lone canonical-named ${presentSurface} surface`, () => {
    const { root } = fixture({
      [presentSurface]: `${STATEFUL_DESIGN_CONTRACTS.map((contract) => contract[phraseKey]).join("\n")}\n`,
    });
    const result = runFixture(root, { trackedPaths: [...statefulDesignBaseTrackedPaths, presentSurface] });
    assert.equal(
      result.stats.statefulDesignContracts,
      "not-applicable",
      "a canonical filename alone must not classify a generic repository as pipeline-shaped",
    );
    assert(
      !result.findings.some((finding) => finding.startsWith("stateful-design-contract:")),
      `generic repositories must not emit stateful-design findings; got: ${result.findings.join(" | ")}`,
    );
  });
}

for (const [presentSurface, missingSurface, phraseKey] of [
  ["templates/spec.md", "roles/elephant.md", "template"],
  ["roles/elephant.md", "templates/spec.md", "elephant"],
]) {
  test(`a lone ${presentSurface} stateful-design surface fails closed`, () => {
    const { root } = fixture({
      ".claude/pipeline.yaml": "schema: pipeline.manifest.v0\n",
      [presentSurface]: `${STATEFUL_DESIGN_CONTRACTS.map((contract) => contract[phraseKey]).join("\n")}\n`,
    });
    const result = runFixture(root, {
      trackedPaths: [...statefulDesignBaseTrackedPaths, ".claude/pipeline.yaml", presentSurface],
    });
    assert.notEqual(
      result.stats.statefulDesignContracts,
      "not-applicable",
      `${missingSurface} must not silently disable the stateful-design contract`,
    );
    assert(
      result.findings.some((finding) => finding.startsWith(`stateful-design-contract: ${missingSurface}:`)),
      `${missingSurface} must have a surface-specific stateful-design finding; got: ${result.findings.join(" | ")}`,
    );
  });
}

for (const [context, conceal] of [
  ["fenced code", (phrase) => `\n\`\`\`text\n${phrase}\n\`\`\`\n`],
  ["HTML comment", (phrase) => `<!-- ${phrase} -->`],
]) {
  for (const [surface, phraseKey] of [
    ["templates/spec.md", "template"],
    ["roles/elephant.md", "elephant"],
  ]) {
    test(`stateful-design phrases hidden only in ${context} fail on ${surface}`, () => {
      const result = checkRepository(REPO, {
        readText(file) {
          let text = readFileSync(file, "utf8");
          if (relative(REPO, file).split("\\").join("/") !== surface) return text;
          for (const requirement of STATEFUL_DESIGN_CONTRACTS) {
            const phrase = requirement[phraseKey];
            assert(text.includes(phrase), `${surface} fixture must contain ${requirement.id}`);
            text = text.replaceAll(phrase, conceal(phrase));
          }
          return text;
        },
      });
      for (const requirement of STATEFUL_DESIGN_CONTRACTS) {
        assert(
          result.findings.includes(`stateful-design-contract: ${surface}: ${requirement.id}`),
          `${surface} must reject ${requirement.id} hidden only in ${context}; got: ${result.findings.join(" | ")}`,
        );
      }
    });
  }
}

const statefulDesignOperativeSections = [
  {
    surface: "templates/spec.md",
    phraseKey: "template",
    start: "### 2a. Stateful guard/control pre-readiness checklist (conditional, mandatory)",
    end: "### 3. Alternatives (mandatory from level 1)",
    rejectedExample: "### Rejected example (non-operative stateful checklist)",
  },
  {
    surface: "roles/elephant.md",
    phraseKey: "elephant",
    start: "### EL-07 (MUST) — Spec-readiness check before implementation",
    end: "### EL-19 (MUST) — PO gate (PRD) before implementation",
    rejectedExample: "## Rejected example (non-operative stateful checklist)",
  },
];

function moveStatefulPhrasesToRejectedExample(text, section) {
  const start = text.indexOf(section.start);
  const end = text.indexOf(section.end, start);
  assert(start >= 0, `${section.surface} fixture must contain its operative section start`);
  assert(end > start, `${section.surface} fixture must contain its operative section end`);

  let operative = text.slice(start, end);
  const phrases = STATEFUL_DESIGN_CONTRACTS.map((contract) => contract[section.phraseKey]);
  for (const phrase of phrases) {
    assert(operative.includes(phrase), `${section.surface} operative section must contain ${phrase}`);
    operative = operative.replaceAll(phrase, `[moved to rejected example]`);
  }

  const rejectedExample = `\n${section.rejectedExample}\n\nThis visible prose is a rejected example, not an operative requirement.\n\n${phrases.map((phrase) => `- ${phrase}`).join("\n")}\n`;
  return {
    text: `${text.slice(0, start)}${operative}${text.slice(end)}${rejectedExample}`,
    rejectedExample,
  };
}

for (const section of statefulDesignOperativeSections) {
  test(`stateful-design phrases moved from the operative section fail on ${section.surface}`, () => {
    let rejectedExample = "";
    const result = checkRepository(REPO, {
      readText(file) {
        const text = readFileSync(file, "utf8");
        if (relative(REPO, file).split("\\").join("/") !== section.surface) return text;
        const moved = moveStatefulPhrasesToRejectedExample(text, section);
        rejectedExample = moved.rejectedExample;
        return moved.text;
      },
    });

    for (const requirement of STATEFUL_DESIGN_CONTRACTS) {
      const phrase = requirement[section.phraseKey];
      assert(rejectedExample.includes(phrase), `${section.surface} must leave ${requirement.id} visible outside its operative section`);
      assert(!rejectedExample.includes("<!--") && !rejectedExample.includes("```"), "the rejected example must remain ordinary Markdown");
      assert(
        result.findings.includes(`stateful-design-contract: ${section.surface}: ${requirement.id}`),
        `${section.surface} must reject ${requirement.id} when it appears only in a non-operative rejected example; got: ${result.findings.join(" | ")}`,
      );
    }
  });
}

test("current repository integration passes and excludes the instruction path", () => {
  const result = checkRepository(REPO);
  assert.deepEqual(result.findings, []);
  assert(result.stats.markdownFiles > 100);
  assert.equal(result.stats.observationGovernance, "checked");
});
