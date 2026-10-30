// SPDX-License-Identifier: SUL-1.0
// AC-147 (catalog half) / AC-209, PO decision D210: the host skill-catalog carrier and what a valid entry adds to the passive read policy.
// Premise: D96/D108 admit a single read of a host-visible file and refuse RECURSIVE searches over the runner skill collection. A valid
// catalog entry adds exactly one thing: a bounded search/listing inside that ONE declared skill directory. Everything D96 refuses stays
// refused: credentials, the collection, parents, undeclared siblings, transcript trees, traversal, alias and link escape.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  declaredSkillDirectories, HOST_SKILL_CATALOG_READBACK_SCHEMA, hostSkillCatalogRecordPath, hostSkillCatalogSeal,
  observeDeclaredSystemSkills, readHostSkillCatalog, writeHostSkillCatalog,
} from "./host-skill-catalog.mjs";
import { resolveGitCommonDir } from "./po-key-directory.mjs";
import { isAllowedPassiveReadTarget } from "./passive-read-policy.mjs";
import { observeHostSkillCatalogReadback } from "../scripts/pipeline-start-preflight.mjs";

const SCRATCH_ROOT = fileURLToPath(new URL("../../../scratch/", import.meta.url));
const WIN = process.platform === "win32";
const NO_PLANE = { machinePlaneRead: () => ({ status: "absent" }), repoKeyDirectory: () => ({ status: "absent" }) };

function fixture() {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const base = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "hsc-")));
  const project = join(base, "project");
  const home = join(base, "home");
  mkdirSync(project, { recursive: true });
  execFileSync("git", ["init", "-q", project], { env: { ...process.env, GIT_CEILING_DIRECTORIES: base } });
  const system = join(home, ".codex", "skills", ".system");
  const declared = join(system, "openai-docs");
  const second = join(system, "skill-creator");
  mkdirSync(join(declared, "references"), { recursive: true });
  mkdirSync(second, { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(join(home, ".codex", "sessions"), { recursive: true });
  writeFileSync(join(declared, "SKILL.md"), "# openai-docs\nline two\n");
  writeFileSync(join(declared, "references", "a.md"), "reference text\n");
  writeFileSync(join(second, "SKILL.md"), "# skill-creator\n");
  writeFileSync(join(home, ".ssh", "id_rsa"), "private\n");
  writeFileSync(join(home, ".codex", "auth.json"), "{}\n");
  writeFileSync(join(home, ".codex", "sessions", "rollout.jsonl"), "{}\n");
  const env = { GIT_CEILING_DIRECTORIES: base };
  return { base, project, home, system, declared, second, skill: join(declared, "SKILL.md"), env };
}

function withFixture(fn) {
  const f = fixture();
  const saved = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = f.base;
  try { return fn(f); } finally {
    if (saved === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = saved;
    rmSync(f.base, { recursive: true, force: true });
  }
}

const readback = (f, runner = "codex", extra = {}) => writeHostSkillCatalog({ rootDir: f.project, runner, homeDir: f.home, ...extra });
const search = (f, raw, options = {}) => isAllowedPassiveReadTarget(raw, { rootDir: f.project, homeDir: f.home, recursive: true, ...NO_PLANE, ...options });
const recordFile = (f, runner = "codex") => hostSkillCatalogRecordPath(resolveGitCommonDir(f.project), runner);

test("a runner without a declaration surface reads back unavailable, writes nothing, and the policy keeps the D108 refusal", () => withFixture((f) => {
  for (const runner of ["claude", "antigravity"]) {
    const r = readback(f, runner);
    assert.equal(r.schema, HOST_SKILL_CATALOG_READBACK_SCHEMA);
    assert.equal(r.status, "unavailable");
    assert.equal(r.code, "HSC-NO-DECLARATION-SURFACE");
  }
  assert.equal(readback(f, "nonsense").code, "HSC-RUNNER");
  assert.equal(readHostSkillCatalog({ rootDir: f.project, homeDir: f.home }).status, "absent");
  assert.equal(search(f, f.declared), false, "no catalog: a recursive search of a skill directory stays refused (D108)");
}));

test("the codex readback writes a sealed private record of the declared skills and a second readback is unchanged", () => withFixture((f) => {
  const first = readback(f, "codex", { now: () => "2026-10-30T10:00:00.000Z" });
  assert.equal(first.status, "written");
  assert.equal(first.entries, 2);
  const file = recordFile(f);
  assert.ok(file.includes(join("agent-pipeline", "host-skill-catalog")), "private state under the git common directory");
  if (!WIN) assert.equal(statSync(file).mode & 0o077, 0, "mode 0600, no group or world access");
  const record = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(record.entries.map((e) => e.name), ["openai-docs", "skill-creator"], "sorted by name");
  assert.deepEqual(Object.keys(record.entries[0]).sort(), ["name", "observedAt", "path", "runner", "sha256"]);
  assert.equal(record.entries[0].runner, "codex");
  assert.equal(record.entries[0].path, f.skill, "the physical instruction file path");
  assert.equal(record.seal, hostSkillCatalogSeal("codex", record.entries));
  const second = readback(f, "codex", { now: () => "2026-10-31T10:00:00.000Z" });
  assert.equal(second.status, "unchanged");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).entries[0].observedAt, "2026-10-30T10:00:00.000Z", "an unchanged observation keeps its first observedAt");
  assert.equal(observeDeclaredSystemSkills({ runner: "codex", homeDir: f.home }).skills.length, 2);
}));

test("a valid entry admits a bounded search inside that one declared skill directory and nothing around it", () => withFixture((f) => {
  readback(f);
  // Only the first declared skill is searched; the sibling is declared too, so test the undeclared cases with a fresh sibling.
  const fresh = join(f.system, "fresh-undeclared");
  mkdirSync(fresh, { recursive: true });
  writeFileSync(join(fresh, "SKILL.md"), "# fresh\n");
  assert.equal(search(f, f.declared), true, "the declared skill directory");
  assert.equal(search(f, join(f.declared, "references")), true, "a subdirectory of the declared skill directory");
  assert.equal(search(f, f.skill, { recursive: false }), true, "its instruction file by its own name");
  assert.equal(search(f, fresh), false, "an undeclared sibling skill directory");
  assert.equal(search(f, f.system), false, "the collection root is a parent, not the declared directory");
  assert.equal(search(f, join(f.home, ".codex", "skills")), false, "the skill tree");
  assert.equal(search(f, join(f.home, ".codex", "sessions")), false, "the transcript tree");
  assert.equal(search(f, join(f.declared, "..", "fresh-undeclared")), false, "a traversal spelling into a sibling");
  assert.equal(search(f, `${f.declared}/references/../..`), false, "a traversal spelling to the parent");
  assert.equal(search(f, `${f.declared}/../openai-docs`), false, "a traversal spelling that lands back inside is still traversal");
}));

test("credentials stay refused: a secret-named file inside the declared directory and a forged entry naming a credential tree", () => withFixture((f) => {
  readback(f);
  assert.equal(search(f, f.declared), true, "baseline");
  // The whole-tree secret screen (safeRecursiveTree, unchanged) still decides inside a declared directory.
  writeFileSync(join(f.declared, "id_rsa"), "private\n");
  assert.equal(search(f, f.declared), false, "a private key inside the declared directory refuses the search");
  rmSync(join(f.declared, "id_rsa"));
  writeFileSync(join(f.declared, ".env"), "TOKEN=x\n");
  assert.equal(search(f, f.declared), false, "an env file inside the declared directory refuses the search");
  rmSync(join(f.declared, ".env"));
  assert.equal(search(f, f.declared), true, "and the search is admitted again once they are gone");
  assert.equal(search(f, join(f.home, ".ssh")), false);
  assert.equal(search(f, join(f.home, ".ssh", "id_rsa"), { recursive: false }), false);
}));

test("a project-local alias or link into the declared directory is not the declared name and stays refused", { skip: WIN && "directory symlinks unavailable on this native Windows host" }, () => withFixture((f) => {
  readback(f);
  symlinkSync(f.declared, join(f.project, "skill-alias"), "dir");
  assert.equal(search(f, join(f.project, "skill-alias")), false);
  assert.equal(search(f, join(f.project, "skill-alias", "references")), false);
}));

test("drift: a replaced instruction file invalidates its entry until the next host readback", () => withFixture((f) => {
  readback(f);
  assert.equal(search(f, f.declared), true);
  writeFileSync(f.skill, "# replaced content\n");
  const stale = readHostSkillCatalog({ rootDir: f.project, homeDir: f.home });
  assert.ok(stale.problems.some((p) => p.name === "openai-docs" && p.code === "HSC-DRIFT"), JSON.stringify(stale.problems));
  assert.equal(search(f, f.declared), false, "the changed entry no longer binds");
  assert.equal(search(f, f.second), true, "a different declared entry is unaffected");
  assert.equal(readback(f).status, "written", "the readback re-observes the new identity");
  assert.equal(search(f, f.declared), true);
  rmSync(f.skill);
  assert.equal(search(f, f.declared), false, "a removed instruction file leaves no authority behind");
}));

test("a forged or hand-edited record is ignored and reported, and the next readback replaces it", () => withFixture((f) => {
  readback(f);
  const file = recordFile(f);
  const record = JSON.parse(readFileSync(file, "utf8"));
  // Hand edit without re-sealing: an entry is added for the sibling directory that was never declared.
  const forged = { ...record, entries: [...record.entries, { ...record.entries[0], name: "forged" }] };
  writeFileSync(file, JSON.stringify(forged));
  chmodSync(file, 0o600);
  const read = readHostSkillCatalog({ rootDir: f.project, homeDir: f.home });
  assert.equal(read.status, "ignored");
  assert.deepEqual(read.problems, [{ runner: "codex", code: "HSC-SEAL-MISMATCH" }]);
  assert.deepEqual(declaredSkillDirectories({ rootDir: f.project, homeDir: f.home }), []);
  assert.equal(search(f, f.declared), false, "a forged record binds nothing, not even its genuine entries");
  const repaired = readback(f);
  assert.equal(repaired.status, "written");
  assert.equal(repaired.replacedInvalid, "HSC-SEAL-MISMATCH");
  assert.equal(search(f, f.declared), true);
}));

test("a re-sealed forgery naming a path outside the declaration surface is rejected entry by entry", () => withFixture((f) => {
  readback(f);
  const file = recordFile(f);
  const record = JSON.parse(readFileSync(file, "utf8"));
  const sshKey = join(f.home, ".ssh", "id_rsa");
  const entries = [{ ...record.entries[0], name: "openai-docs", path: sshKey }, { ...record.entries[1], sha256: "0".repeat(63) }];
  writeFileSync(file, JSON.stringify({ ...record, entries, seal: hostSkillCatalogSeal("codex", entries) }));
  chmodSync(file, 0o600);
  const read = readHostSkillCatalog({ rootDir: f.project, homeDir: f.home });
  assert.deepEqual(read.entries, []);
  assert.deepEqual(read.problems.map((p) => p.code).sort(), ["HSC-ENTRY-OUTSIDE-SURFACE", "HSC-ENTRY-SHAPE"]);
  assert.equal(search(f, f.declared), false);
  assert.equal(search(f, join(f.home, ".ssh")), false);
}));

test("a record with loose permissions is not trusted", { skip: WIN && "POSIX mode bits" }, () => withFixture((f) => {
  readback(f);
  chmodSync(recordFile(f), 0o644);
  const read = readHostSkillCatalog({ rootDir: f.project, homeDir: f.home });
  assert.equal(read.entries.length, 0);
  assert.equal(read.problems[0].code, "HSC-RECORD-CUSTODY");
  assert.equal(search(f, f.declared), false, "a record outside custody binds nothing");
  // Self-heal: the next host readback replaces the record that failed custody and says so.
  const repaired = readback(f);
  assert.equal(repaired.status, "written");
  assert.equal(repaired.replacedInvalid, "HSC-RECORD-CUSTODY");
  assert.equal(statSync(recordFile(f)).mode & 0o077, 0);
  assert.equal(search(f, f.declared), true);
}));

test("the bootstrap preflight readback is the writer: typed result per runner, nothing outside an active governed repository, never a throw", () => withFixture((f) => {
  const active = () => ({ state: "active" });
  const common = { rootDir: f.project, homeDir: f.home, observeGovernanceScopeFn: active };
  assert.equal(observeHostSkillCatalogReadback({ ...common, env: { CLAUDECODE: "1" } }).status, "unavailable", "claude declares no surface");
  assert.equal(observeHostSkillCatalogReadback({ ...common, env: { ANTIGRAVITY_AGENT: "1" } }).code, "HSC-NO-DECLARATION-SURFACE");
  assert.equal(readHostSkillCatalog({ rootDir: f.project, homeDir: f.home }).status, "absent", "an unavailable readback wrote nothing");
  const env = { CODEX_SESSION_ID: "session" };
  assert.equal(observeHostSkillCatalogReadback({ ...common, env }).status, "written");
  assert.equal(observeHostSkillCatalogReadback({ ...common, env }).status, "unchanged");
  assert.equal(search(f, f.declared), true, "the preflight readback is what binds the declared directory");
  assert.equal(observeHostSkillCatalogReadback({ ...common, env, observeGovernanceScopeFn: () => ({ state: "inactive" }) }), undefined);
  const failed = observeHostSkillCatalogReadback({ ...common, env, writeFn: () => { throw new Error("boom"); } });
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.code, "HSC-READBACK-FAILED");
}));

test("without a repository the reader reports unavailable and the readback writes nothing", () => {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const base = realpathSync(mkdtempSync(join(SCRATCH_ROOT, "hsc-norepo-")));
  const saved = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = base;
  try {
    const home = join(base, "home");
    mkdirSync(join(home, ".codex", "skills", ".system", "a"), { recursive: true });
    writeFileSync(join(home, ".codex", "skills", ".system", "a", "SKILL.md"), "# a\n");
    const bare = join(base, "bare");
    mkdirSync(bare);
    assert.equal(writeHostSkillCatalog({ rootDir: bare, runner: "codex", homeDir: home }).code, "HSC-NO-REPOSITORY");
    assert.equal(readHostSkillCatalog({ rootDir: bare, homeDir: home }).status, "unavailable");
    assert.equal(isAllowedPassiveReadTarget(join(home, ".codex", "skills", ".system", "a"), { rootDir: bare, homeDir: home, recursive: true, ...NO_PLANE }), false);
  } finally {
    if (saved === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = saved;
    rmSync(base, { recursive: true, force: true });
  }
});
