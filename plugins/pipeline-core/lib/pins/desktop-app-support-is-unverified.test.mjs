// SPDX-License-Identifier: SUL-1.0
// Pin (ALF-C-P20-01, AC-159): original Alfred item pipeline.desktop-app-support-is-unverified.
// Acceptance (item Proposal): (a) document that Desktop WSL sessions carry no pipeline protection and
// must not be used for governed repositories; (b) document that PO commands run in the integrated or
// an external terminal; (c) the Desktop surface stays honestly labelled unverified and names the open
// acceptance item (an unprotected/unverified surface is named, not discovered); (d) the live-host
// checks (bootstrap line, guard denial, background Goldfish, statusLine identity) can only be proven
// in the real Desktop app and are reported as `native: pending`, never faked.
// Reads the real maintained docs; the RED cases run the SAME examiner against scratch mutations of
// the real text (never an in-place edit of the docs).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const scratchBase = join(repoRoot, "scratch");
mkdirSync(scratchBase, { recursive: true });
const work = realpathSync(mkdtempSync(join(scratchBase, "alf-c-p20-01-")));
after(() => rmSync(work, { recursive: true, force: true }));

const ITEM = "backlog/items/2026-10-07-desktop-app-support-is-unverified.md";
const runnerSupport = readFileSync(join(repoRoot, "docs", "runner-support.md"), "utf8");
const adminInventory = readFileSync(join(repoRoot, "docs", "admin-steps-inventory.md"), "utf8");

// Examiner: the "Claude Desktop app" section of runner-support.md.
function desktopSection(text) {
  const m = /^## Claude Desktop app\s*$/m.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}
function examineDesktop(text) {
  const s = desktopSection(text);
  if (s === null) return { section: false };
  const flat = s.replace(/\s+/g, " ");
  return {
    section: true,
    wslNoGuard: /Desktop WSL sessions load no plugins, so no pipeline guard runs/.test(flat),
    wslDoNotUse: /Do not use them for a governed repository/.test(flat),
    terminalForPoCommands: /PO\/human commands \(signing, `!`-prefixed commands\) run in the integrated or an external terminal/.test(flat),
    labelledUnverified: /not yet verified/.test(flat),
    namesOpenItem: flat.includes(ITEM),
    noProfiles: /Desktop does not load PowerShell profiles/.test(flat),
  };
}
const GREEN = examineDesktop(runnerSupport);

describe("AC-159 desktop-app-support-is-unverified", () => {
  test("the Desktop section exists in the maintained runner-support doc", () => {
    assert.equal(GREEN.section, true);
  });

  test("Desktop WSL sessions are documented as carrying no pipeline protection and not for governed repos", () => {
    assert.equal(GREEN.wslNoGuard, true);
    assert.equal(GREEN.wslDoNotUse, true);
  });

  test("PO/human commands (signing, ! commands) are documented to run in the integrated or an external terminal", () => {
    assert.equal(GREEN.terminalForPoCommands, true);
  });

  test("the Desktop surface is labelled unverified and names the open acceptance item, which exists", () => {
    assert.equal(GREEN.labelledUnverified, true);
    assert.equal(GREEN.namesOpenItem, true);
    assert.equal(existsSync(join(repoRoot, ITEM)), true);
  });

  test("the Desktop environment caveat (no PowerShell profiles) is documented", () => {
    assert.equal(GREEN.noProfiles, true);
  });

  test("the admin-steps inventory carries both PO-facing Desktop steps, pointing at the runner-support lines", () => {
    const flat = adminInventory.replace(/\s+/g, " ");
    assert.match(flat, /Do not use Desktop WSL sessions for a governed repository \| per session \| PO \|/);
    assert.match(flat, /Run signing and `!` commands in the integrated or an external terminal \(Desktop\) \| per push \| PO terminal \|/);
    assert.match(flat, /docs\/runner-support\.md:33/);
    assert.match(flat, /docs\/runner-support\.md:35/);
    const lines = runnerSupport.split("\n");
    assert.match(lines[32], /Desktop WSL sessions load no plugins/);
    assert.match(lines[34], /PO\/human commands/);
  });

  describe("RED: the examiner fails on a scratch mutation of the real text", () => {
    const mutate = (name, fn) => {
      const p = join(work, name);
      writeFileSync(p, fn(runnerSupport));
      return examineDesktop(readFileSync(p, "utf8"));
    };
    test("WSL warning removed -> detected", () => {
      const r = mutate("no-wsl.md", (t) => t.replace(/^- \*\*Desktop WSL sessions.*$/m, ""));
      assert.equal(r.wslNoGuard, false);
      assert.equal(r.wslDoNotUse, false);
    });
    test("terminal requirement removed -> detected", () => {
      const r = mutate("no-term.md", (t) => t.replace(/^- PO\/human commands.*$/m, ""));
      assert.equal(r.terminalForPoCommands, false);
    });
    test("unverified label / open item pointer removed -> detected", () => {
      const r = mutate("no-label.md", (t) => t.replace("not\nyet verified", "verified").replace("not yet verified", "verified").replace(ITEM, "x"));
      assert.equal(r.labelledUnverified, false);
      assert.equal(r.namesOpenItem, false);
    });
    test("section removed -> detected", () => {
      assert.equal(mutate("no-sec.md", (t) => t.replace("## Claude Desktop app", "## Other")).section, false);
    });
  });

  describe("live Desktop-app points", () => {
    for (const [name, fn] of [
      ["bootstrap confirmation line shown in a Desktop (Windows path) session", "plugins/pipeline-core/scripts/pipeline-start-preflight.mjs (run through the Desktop app's session start)"],
      ["a guard denial of a forbidden command fires with plugin-supplied hooks", "plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs --runner claude (PreToolUse in Desktop)"],
      ["a background Goldfish dispatch runs and returns", "agents/goldfish-implementor via the Agent tool with run_in_background in Desktop"],
      ["statusLine identity reported in Desktop is recorded", "the configured statusLine command evaluated by the Desktop host"],
    ]) {
      test(`native: pending - ${name}`, { skip: `native: pending (live Desktop app only); a native run exercises ${fn}` }, () => {});
    }
    test("host limitation: Linux/WSL run (owner Coordinator, due 2026-10-19, PO decision K7)", { skip: "host-limitation: directory mode bits/symlinks unavailable on native Windows; owner Coordinator, due 2026-10-19; none needed by the doc-contract cases above" }, () => {});
  });
});
