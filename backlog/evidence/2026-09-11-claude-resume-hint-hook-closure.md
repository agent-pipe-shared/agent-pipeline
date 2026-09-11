# Claude Resume-Hint SessionStart hook closure

The Nova B item claiming that Claude Code lacks mechanical Resume-Hint
delivery was stale when it was created. Commit
`a8bd954dd61ebedd206f94f1d53fe6da1d2d2f5b` had already registered
`hooks/codex-session-start-hint.mjs` in the Claude `hooks.json`
`startup|resume|clear` SessionStart matcher. The filename retains its historical
Codex origin; the hook output contract is runner-compatible and emits Claude's
`hookSpecificOutput.additionalContext` shape.

Current-candidate verification at `63d66cfe01367132abb7f0714f0f7309e8eab959`:

- `node plugins/pipeline-core/hooks/codex-session-start-hint.test.mjs`:
  48 passed. This covers the actual stdout payload, full Resume-Hint fields,
  digest-bound delivery and consumption, CLI session identity, compact routing,
  and fail-closed delivery persistence.
- `node plugins/pipeline-core/hooks/hooks-manifest-shape.test.mjs`:
  12 passed. This parses the Claude, Codex and Antigravity manifests and proves
  that every declared hook command resolves to a shipped script.
- `git blame` and `git log -S codex-session-start-hint.mjs --
  plugins/pipeline-core/hooks/hooks.json` bind the Claude registration to the
  implementation commit above.

No protected manifest edit or new PO decision is required: the accepted option
to share one runner-compatible hook was already implemented. This closure does
not claim that every host has refreshed its installed plugin copy; installation
attestation is tracked separately.
