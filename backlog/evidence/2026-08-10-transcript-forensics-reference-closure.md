# Closure evidence: durable transcript-forensics reference

- **Item:** `2026-08-09-no-durable-practice-for-mining-session-transcripts-for-happy-path-defects.md`
- **Fix commit:** `264be61996ce74b3b789374f0af396f9ce495df7` (GF-087,
  goldfish-implementor) — adds
  `plugins/pipeline-core/skills/pipeline-start/references/transcript-forensics.md`,
  covering transcript grep targets for both Claude Code JSONL and Codex
  rollout JSONL formats, the standard check categories (dispatch discipline,
  doc-vs-machine-state drift, guard false-positives, terminal-command
  safety, restart/context-loss behavior, escalation/friction counts), and
  the confirmed/partial/not-found report shape; registered in `SKILL.md`'s
  "Typed lazy loading" list.
- **Independent verification (Elephant, this session):** `git show
  264be619` reviewed directly. `node plugins/pipeline-core/skills/pipeline-start/pipeline-start-v3.test.mjs`
  → exit 0. Full `node harness/scripts/verify.mjs` → 267/267 suites, exit 0.
