---
schema: pipeline.backlog-item.v1
id: pipeline.claude-windows-greenfield-lifecycle-not-walkable
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "PO observation after the 0.7.0 three-runner greenfield tests, 2026-10-03, and the Claude/Windows analysis in the Claude test repo (docs/pipeline-analyse-greenfield.md)."
sprint: alfred
done_when: manual
---

# Claude on Windows cannot make all required lifecycle calls

## Description

**PO observation:** Claude cannot make all necessary calls under Windows
("CAS missing" or similar) and therefore fails. The analysis ends in `draft`
with zero product code after about 87 minutes and two override signatures.

This item collects the Claude/Windows-specific causes. Cross-runner causes
live in their own items:

- Coordination commands refused in draft:
  `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md`
  (V-1, V-4, V-6, V-8).
- Advisor producer fails silently:
  `2026-10-03-role-route-preflight-with-self-dispatch-fallback.md` (V-2, V-11).
- Override burnt: `2026-10-03-guard-override-request-digest-drifts-after-arming.md` (V-3).
- Read blocks: `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md`,
  `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md`.

Remaining Claude/Windows-specific frictions:

- **V-9:** `--answers-json` in Bash breaks at about 10 KB (`unexpected EOF`,
  Windows command-line limit), and PowerShell is refused for the flow. Provide
  `--answers-file` analogous to `--text-file` and document the limit.
- **V-10:** the dispatch guard demands the full briefing inline, while the
  continuity route digest binds a briefing file. Derive the digest from the
  briefing actually sent.
- **V-12:** language asked twice (onboarding and intake) although supplied as a
  reviewed default.
- **V-13:** `docs/state.md` projection stale after design progress. Mark it as a
  timestamped snapshot or keep the projection current.
- The CAS/"missing" failure named by the PO is not yet located in the report.
  Reproduce it on the new candidate and record the exact code here.

## Acceptance

- The Claude/Windows greenfield run reaches implementation and push within the
  two-approval happy path
  (`2026-10-03-three-runner-happy-path-with-two-po-approvals.md`).
- V-9, V-10, V-12 and V-13 are fixed or explicitly dispositioned.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Agent measurement (2026-10-22)

`plugins/pipeline-core/lib/pins/claude-windows-greenfield-lifecycle-not-walkable.test.mjs` now has 36 cases (35 pass, 0 fail, 1 skipped).

- V-9, V-12, V-13: covered by the existing pin cases, unchanged and green.
- V-10: the route digest is bound to the inline briefing, the producer and the guard admission step record it, and the caller set is pinned.
  The header listed three typed gaps. One is stale: Codex registers `guard-dispatch.mjs` on the `spawn_agent` matcher in
  `hooks/codex-hooks.json`, and the Antigravity adapter runs it for every Task/Agent entry, once per Subagents element. That is now a
  source-scan case with a RED proof. It reads the shipped files and does not prove a live host fires the hook. The other two gaps are
  still open and are not fixable from an unprotected file: a Critic or unrelated-role dispatch carries no Slice line, so there is
  nothing to bind, and a dynamically built Workflow script cannot be resolved statically by `hooks/guard-dispatch.mjs` (protected). Both
  need a route-policy decision about what a route record means for a dispatch without a slice.
- The CAS/"missing" failure: not reproduced and not located. It needs the Windows run, and no code or message text from the report is
  available here. Searching the library for CAS-style codes returns many unrelated hits, so naming one would be a guess. It stays open.
- The two-approval happy path (implementation and push) stays a skipped native case that needs a live interactive Claude/Windows session.
