// SPDX-License-Identifier: SUL-1.0
// Pins lib/published-tag-push.mjs (N27a / D206): the one predicate guard-push and the generated pre-push hook share.
// NOTE: this file needs registration in the project's Verify suite list (harness/scripts/verify.mjs) -- it is not run by Verify before that.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { classifyPublishedTagPush, isGatedTagRef, RELEASE_TAG_REF } from "./published-tag-push.mjs";

const DIRS = [];
after(() => { for (const dir of DIRS) rmSync(dir, { recursive: true, force: true }); });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "published-tag-push-"));
  DIRS.push(dir);
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "goldfish@example.invalid");
  git("config", "user.name", "Goldfish");
  const commit = (name) => {
    writeFileSync(join(dir, `${name}.txt`), `${name}\n`);
    git("add", `${name}.txt`);
    git("commit", "-q", "-m", name);
    return git("rev-parse", "HEAD").stdout.trim();
  };
  const published = commit("published");
  git("remote", "add", "origin", "https://example.invalid/fixture.git");
  git("update-ref", "refs/remotes/origin/main", published);
  const unpublished = commit("unpublished");
  return { dir, git, published, unpublished };
}

const ask = (r, over) => classifyPublishedTagPush({ projectDir: r.dir, remote: "origin", tagRef: "refs/tags/rollback/2026-10-30-block1", target: r.published, ...over });

test("a rollback tag on a commit reachable from a remote-tracking ref of the same remote passes", () => {
  const r = repo();
  const verdict = ask(r);
  assert.equal(verdict.passes, true, JSON.stringify(verdict));
  assert.equal(verdict.code, "PTP-PUBLISHED");
  assert.equal(verdict.commit, r.published);
});

test("any non-release tag on a published commit passes, and an ancestor of the remote-tracking tip counts as published", () => {
  const r = repo();
  r.git("update-ref", "refs/remotes/origin/main", r.unpublished);
  assert.equal(ask(r, { tagRef: "refs/tags/checkpoint-1", target: r.published }).passes, true);
  assert.equal(ask(r, { target: r.unpublished }).passes, true, "a commit AT the remote-tracking tip is published");
});

test("an annotated tag object is peeled to its commit before reachability is asked", () => {
  const r = repo();
  r.git("tag", "-a", "-m", "annotated", "rollback/annotated", r.published);
  const tagObject = r.git("rev-parse", "rollback/annotated").stdout.trim();
  assert.notEqual(tagObject, r.published);
  const verdict = ask(r, { target: tagObject });
  assert.equal(verdict.passes, true, JSON.stringify(verdict));
  assert.equal(verdict.commit, r.published);
});

test("every other tag stays gated: unpublished commit, release tags (published or not), another remote, a URL, a non-tag ref", () => {
  const r = repo();
  const gated = [
    ["unpublished commit", { target: r.unpublished }, "PTP-UNPUBLISHED"],
    ["release tag on a published commit", { tagRef: "refs/tags/v1.2.3" }, "PTP-RELEASE-TAG"],
    ["beta release tag on a published commit", { tagRef: "refs/tags/v1.2.3-beta.1" }, "PTP-RELEASE-TAG"],
    ["release tag on an unpublished commit", { tagRef: "refs/tags/v2.0.0", target: r.unpublished }, "PTP-RELEASE-TAG"],
    ["a release-looking tag outside the strict grammar", { tagRef: "refs/tags/v1.2" }, "PTP-RELEASE-TAG"],
    ["a branch ref", { tagRef: "refs/heads/feature" }, "PTP-NOT-A-TAG"],
    ["a remote that is a URL", { remote: "https://example.invalid/fixture.git" }, "PTP-REMOTE-NOT-A-NAME"],
    ["a remote that is not configured", { remote: "nowhere" }, "PTP-REMOTE-NOT-A-NAME"],
    ["an option-shaped remote", { remote: "--upload-pack=x" }, "PTP-REMOTE-NOT-A-NAME"],
    ["a target that is not a commit", { target: "0".repeat(40) }, "PTP-COMMIT-UNRESOLVED"],
  ];
  for (const [label, over, code] of gated) {
    const verdict = ask(r, over);
    assert.equal(verdict.passes, false, `${label}: ${JSON.stringify(verdict)}`);
    assert.equal(verdict.code, code, label);
  }
  r.git("update-ref", "refs/remotes/other/main", r.unpublished);
  assert.equal(ask(r, { target: r.unpublished }).passes, false, "publication on ANOTHER remote does not count");
  assert.equal(ask(r, { target: r.unpublished, remote: "other" }).code, "PTP-REMOTE-NOT-A-NAME", "a remote-tracking ref without a configured remote is not a remote");
});

test("release-tag grammar: strict v<n>.<n>.<n>[-beta.<n>] is a release tag; the gate is wider than the grammar", () => {
  assert.equal(RELEASE_TAG_REF.test("refs/tags/v1.2.3"), true);
  assert.equal(RELEASE_TAG_REF.test("refs/tags/v1.2.3-beta.4"), true);
  assert.equal(RELEASE_TAG_REF.test("refs/tags/v01.2.3"), false);
  assert.equal(RELEASE_TAG_REF.test("refs/tags/rollback/v1.2.3"), false);
  assert.equal(isGatedTagRef("refs/tags/v1.2"), true);
  assert.equal(isGatedTagRef("refs/tags/rollback/v1.2.3"), false);
});
