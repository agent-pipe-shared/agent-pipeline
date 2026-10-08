// SPDX-License-Identifier: SUL-1.0
/**
 * gh-cmd.test.mjs -- RED pins for the `gh` delivery classifier (slice PR-S1, task PR-S1-T).
 *
 * Contract source: specs/sprint-alfred-epic/design/pr-delivery-mode-2026-10-08.md, section 2
 * ("Common to all (slice 1)") and section 3 (test-first order, item 1), under PO decision AN
 * (specs/sprint-alfred-epic/plans/po-decisions-2026-10-07.md row AN): pull request joins push as a second
 * delivery mode; platform merge and artifact hand-off are refused as typed "unsupported", never silently
 * allowed.
 *
 * The module under test, ./gh-cmd.mjs, does not exist yet. Every case in this file therefore fails at import.
 * That is the deliverable of a test-only dispatch (QG-04): the pin comes first, the implementation follows.
 *
 * Shape of the classifier (an ALLOWLIST plus a fail-closed marker rule, in the style of commandIsGitPush in
 * ./git-cmd.mjs; it must split compound commands the way that module does, so a gh word after `cd x &&` is seen):
 *
 *   classifyGhCommand(command) -> one of
 *     { kind: "none" }                                  no `gh` invocation in the command (an argument is data)
 *     { kind: "read-only" }                             a `gh` invocation that cannot deliver or mutate
 *     { kind: "delivery", action: "pr-create" }         the one admitted delivery action of this slice
 *     { kind: "refused", code }                         code is a member of GH_DELIVERY_CODES
 *
 * Only `kind`, `code` and `action` are pinned; the result may carry further fields.
 *
 * Out of scope on purpose: `gh release create` keeps its documented separate authority (the PO approval described
 * in docs/push-release-flow.md) and is not reclassified here. One case below pins that it is NOT turned into an
 * artifact hand-off refusal.
 *
 * Run:   node --test plugins/pipeline-core/lib/gh-cmd.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyGhCommand, GH_DELIVERY_CODES } from "./gh-cmd.mjs";

const PLATFORM_MERGE = "DELIVERY-UNSUPPORTED-PLATFORM-MERGE";
const ARTIFACT_HANDOFF = "DELIVERY-UNSUPPORTED-ARTIFACT-HANDOFF";
const API_MUTATION = "DELIVERY-UNSUPPORTED-API-MUTATION";
const PR_RETARGET = "DELIVERY-UNSUPPORTED-PR-RETARGET";
const CROSS_REPO = "DELIVERY-UNSUPPORTED-CROSS-REPO";
const BINDING_INCOMPLETE = "DELIVERY-PR-BINDING-INCOMPLETE";
const UNCLASSIFIED = "DELIVERY-GH-UNCLASSIFIED";

/** The closed code list of design note section 2, sorted for comparison. */
const EXPECTED_CODES = [
  ARTIFACT_HANDOFF,
  API_MUTATION,
  BINDING_INCOMPLETE,
  CROSS_REPO,
  UNCLASSIFIED,
  PLATFORM_MERGE,
  PR_RETARGET,
].sort();

const refused = (code, command) => ({ kind: "refused", code, command });
const delivery = (action, command) => ({ kind: "delivery", action, command });
const readOnly = (command) => ({ kind: "read-only", command });
const none = (command) => ({ kind: "none", command });

// ---- The table named by the briefing ---------------------------------------------------------------------------
const BRIEFED_CASES = [
  // Platform merge: refused, typed, never silently allowed (decision AN).
  refused(PLATFORM_MERGE, "gh pr merge 12"),
  refused(PLATFORM_MERGE, "gh pr merge --auto --squash 12"),
  refused(PLATFORM_MERGE, "gh api -X PUT repos/o/r/pulls/12/merge"),
  refused(
    PLATFORM_MERGE,
    `gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:"x"}){clientMutationId}}'`,
  ),
  refused(
    PLATFORM_MERGE,
    `gh api graphql -f query='mutation{enablePullRequestAutoMerge(input:{pullRequestId:"x"}){clientMutationId}}'`,
  ),

  // Artifact hand-off: refused, typed.
  refused(ARTIFACT_HANDOFF, "gh release upload v1 a.zip"),
  refused(ARTIFACT_HANDOFF, "gh gist create a.txt"),

  // Any other non-GET gh api call: refused, typed. A field flag implies POST.
  refused(API_MUTATION, "gh api -X POST repos/o/r/issues"),
  refused(API_MUTATION, "gh api --method DELETE repos/o/r/git/refs/heads/x"),
  refused(API_MUTATION, "gh api -f title=x repos/o/r/issues"),

  // Retargeting an approved PR would move it.
  refused(PR_RETARGET, "gh pr edit 12 --base main"),

  // Cross-repo and fork PRs are unsupported in this slice.
  refused(CROSS_REPO, "gh pr create --repo other/repo --base main --head feat/x"),
  refused(CROSS_REPO, "gh pr create --head someone:feat/x --base main"),

  // The one admitted delivery action, with an explicit head and base.
  delivery("pr-create", "gh pr create --base main --head feat/x --title t --body b"),
  delivery("pr-create", "gh pr create --draft --base main --head feat/x --fill"),

  // Read-only gh stays unclassified for delivery purposes.
  readOnly("gh pr view 12"),
  readOnly("gh pr list"),
  readOnly("gh api repos/o/r/pulls/12"),
  readOnly("gh pr diff 12"),
  readOnly("gh pr checks 12"),

  // Fail closed: a gh word the allowlist does not know is refused, never waved through.
  refused(UNCLASSIFIED, "gh pr frobnicate"),
  refused(UNCLASSIFIED, "gh extension exec x"),
  refused(UNCLASSIFIED, "gh alias set m 'pr merge'"),

  // Compound commands and disguises of the executable word.
  refused(PLATFORM_MERGE, "cd repo && gh pr merge 1"),
  refused(PLATFORM_MERGE, "GH_TOKEN=x gh pr merge 1"),
  refused(PLATFORM_MERGE, "/usr/bin/gh pr merge 1"),
  none("echo gh pr merge 1"),

  // Not gh at all.
  none("git status"),
  none("ls gh"),
];

// ---- Cases the design note names that the briefing's table does not repeat -------------------------------------
// Design note section 2: DELIVERY-PR-BINDING-INCOMPLETE (a gh pr create without an explicit --head and --base) and
// the marker rule of DELIVERY-GH-UNCLASSIFIED (substitution, nested shell). Section 3, slice 1, item 1 lists both
// in this test file. Kept in their own block so each can be struck on its own if the PO decides otherwise.
const DESIGN_NOTE_CASES = [
  refused(BINDING_INCOMPLETE, "gh pr create --base main --title t --body b"),
  refused(BINDING_INCOMPLETE, "gh pr create --head feat/x --title t --body b"),
  refused(UNCLASSIFIED, "gh pr $(echo merge) 1"),
  refused(UNCLASSIFIED, "gh pr `echo merge` 1"),
  refused(UNCLASSIFIED, "bash -c 'gh pr merge 1'"),
];

const ALL_CASES = [...BRIEFED_CASES, ...DESIGN_NOTE_CASES];

function describeExpectation(expected) {
  if (expected.kind === "refused") return `refused ${expected.code}`;
  if (expected.kind === "delivery") return `delivery ${expected.action}`;
  return expected.kind;
}

function assertClassification(expected) {
  const result = classifyGhCommand(expected.command);
  assert.ok(
    result !== null && typeof result === "object",
    `classifyGhCommand must return an object for: ${expected.command}`,
  );
  assert.equal(result.kind, expected.kind, `kind for: ${expected.command}`);
  if (expected.kind === "refused") {
    assert.equal(result.code, expected.code, `code for: ${expected.command}`);
    assert.ok(
      Array.isArray(GH_DELIVERY_CODES) && GH_DELIVERY_CODES.includes(result.code),
      `returned code ${String(result.code)} must be a member of GH_DELIVERY_CODES, for: ${expected.command}`,
    );
  } else {
    assert.equal(result.code, undefined, `a ${expected.kind} result carries no refusal code, for: ${expected.command}`);
  }
  if (expected.kind === "delivery") {
    assert.equal(result.action, expected.action, `action for: ${expected.command}`);
  }
}

for (const expected of ALL_CASES) {
  test(`PR-S1: ${describeExpectation(expected)}: ${expected.command}`, () => {
    assertClassification(expected);
  });
}

// ---- The closed code list ---------------------------------------------------------------------------------------
test("PR-S1: GH_DELIVERY_CODES is exactly the closed code list, without duplicates", () => {
  assert.ok(Array.isArray(GH_DELIVERY_CODES), "GH_DELIVERY_CODES must be an array");
  assert.equal(new Set(GH_DELIVERY_CODES).size, GH_DELIVERY_CODES.length, "no duplicate code");
  assert.deepEqual([...GH_DELIVERY_CODES].sort(), EXPECTED_CODES);
});

test("PR-S1: the table uses only codes from GH_DELIVERY_CODES", () => {
  assert.ok(Array.isArray(GH_DELIVERY_CODES), "GH_DELIVERY_CODES must be an array");
  const used = ALL_CASES.filter((c) => c.kind === "refused").map((c) => c.code);
  for (const code of used) {
    assert.ok(GH_DELIVERY_CODES.includes(code), `table code ${code} is not in GH_DELIVERY_CODES`);
  }
});

test("PR-S1: every code in GH_DELIVERY_CODES is exercised by at least one table case", () => {
  assert.ok(Array.isArray(GH_DELIVERY_CODES), "GH_DELIVERY_CODES must be an array");
  const used = new Set(ALL_CASES.filter((c) => c.kind === "refused").map((c) => c.code));
  for (const code of GH_DELIVERY_CODES) {
    assert.ok(used.has(code), `GH_DELIVERY_CODES member ${code} has no table case`);
  }
});

// ---- Out of scope: gh release create ----------------------------------------------------------------------------
test("PR-S1: gh release create is not reclassified as an artifact hand-off (its authority lives elsewhere)", () => {
  // `gh release create` keeps its documented separate PO approval (docs/push-release-flow.md); this slice must not
  // absorb it. Two things are wrong: calling it an artifact hand-off, and calling it read-only (it publishes). Which
  // other kind it gets (for example a fail-closed unclassified refusal) is left open on purpose.
  const result = classifyGhCommand("gh release create v1 --title t --notes n");
  assert.ok(result !== null && typeof result === "object", "classifyGhCommand must return an object");
  assert.ok(
    result.kind !== "refused" || result.code !== ARTIFACT_HANDOFF,
    `gh release create must not be classified as ${ARTIFACT_HANDOFF}`,
  );
  assert.notEqual(result.kind, "read-only", "gh release create publishes; it is not read-only");
});

// ---- PR-S1-T2: the classifier's fail-open paths (Critic PR-F1, PR-F2, PR-F4; dispatcher ruling 28) -------------------
// Contract source: specs/sprint-alfred-epic/evidence/critic-2026-10-07/pr-s1-full.md, finding PR-F1 (a redirection
// prefix or an unlisted wrapper hides the gh word, so the command classifies `none`), PR-F2 (GH_REPO / GH_HOST are
// ignored, so a cross-repo or cross-host pull request is admitted) and PR-F4 (two deliveries in one command report
// only the first), and the "Dispatcher disposition" ruling 28 beneath them. These pins are RED by design until the
// classifier follows the ruling (QG-04: the pin comes first, the implementation follows). Every input below is only
// ever handed to classifyGhCommand as text; none of it is executed. The cases reuse the helpers and the assertion
// above and live in their own table so the existing cases and the closed-code-list checks are untouched.
const PR_S1_T2_GROUPS = [
  {
    // Ruling 28 (a): redirection tokens (`[0-9]*[<>]...`, `&>...`) are skipped when locating the command word, so the
    // command is classified exactly like the plain `gh pr merge 1`.
    label: "(a) a redirection prefix is skipped",
    cases: [
      refused(PLATFORM_MERGE, "2>/dev/null gh pr merge 1"),
      refused(PLATFORM_MERGE, ">out.txt gh pr merge 1"),
      refused(PLATFORM_MERGE, "</dev/null gh pr merge 1"),
      refused(PLATFORM_MERGE, "&>/dev/null gh pr merge 1"),
      refused(PLATFORM_MERGE, "gh pr view 1 >/dev/null && 2>/dev/null gh pr merge 1"),
    ],
  },
  {
    // Ruling 28 (b), the fail-closed marker rule: a segment whose command word is not gh, a transparent wrapper or an
    // opaque runner, but whose text holds a gh word followed by pr, api, release, repo or gist, is unclassified
    // (refused), never `none` and never `read-only`. `env -S` and the git / vim shapes are pinned for gh only.
    label: "(b) the marker rule refuses an unlisted wrapper",
    cases: [
      refused(UNCLASSIFIED, "winpty gh pr merge 1"),
      refused(UNCLASSIFIED, "strace -f gh pr merge 1"),
      refused(UNCLASSIFIED, "flock /tmp/l gh pr merge 1"),
      refused(UNCLASSIFIED, "op run -- gh pr merge 1"),
      refused(UNCLASSIFIED, "coproc gh pr merge 1"),
      refused(UNCLASSIFIED, "winpty gh api -X PUT repos/o/r/pulls/12/merge"),
      refused(UNCLASSIFIED, "env -S 'gh pr merge 1'"),
      refused(UNCLASSIFIED, "git -c alias.x='!gh pr merge 1' x"),
      refused(UNCLASSIFIED, "vim -c '!gh pr merge 1'"),
    ],
  },
  {
    // Ruling 28 (c): any GH_REPO or GH_HOST assignment in the command (prefix, `env`, `export`) makes a delivery
    // unsupported cross-repo, in the shape the existing --repo case asserts.
    label: "(c) a GH_REPO / GH_HOST assignment is cross-repo",
    cases: [
      refused(CROSS_REPO, "GH_REPO=other/repo gh pr create --base main --head feat/x"),
      refused(CROSS_REPO, "env GH_REPO=o/r gh pr create --base main --head feat/x"),
      refused(CROSS_REPO, "export GH_REPO=other/repo && gh pr create --base main --head feat/x"),
      refused(CROSS_REPO, "GH_HOST=evil.example gh pr create --base main --head feat/x"),
    ],
  },
  {
    // Ruling 28 (d): more than one delivery action in one command cannot be bound to one head and base.
    label: "(d) two deliveries in one command are an incomplete binding",
    cases: [
      refused(BINDING_INCOMPLETE, "gh pr create --base main --head feat/x && gh pr create --base release --head feat/y"),
    ],
  },
];

for (const { label, cases } of PR_S1_T2_GROUPS) {
  for (const expected of cases) {
    test(`PR-S1-T2: ${label}: ${describeExpectation(expected)}: ${expected.command}`, () => {
      assertClassification(expected);
    });
  }
}

test("PR-S1-T2: (b) negative control: `echo gh` stays non-refused (no pr, api, release, repo or gist after the gh word)", () => {
  const result = classifyGhCommand("echo gh");
  assert.ok(result !== null && typeof result === "object", "classifyGhCommand must return an object");
  assert.notEqual(result.kind, "refused", "a bare gh word with no pr, api, release, repo or gist after it is data");
});
