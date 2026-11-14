test(critic): prove the guard admits a split part's envelope with its scope-marker row

The T5 test checked the rendered split-part envelope only against
CRITIC_DISPATCH_PROSE. The Antigravity pretool guard's end-to-end
admission case rendered the canonical envelope with the new
scope-marker row left as a placeholder. It now renders the row as
scope:group-1, asserts no placeholder is left, and the guard still
admits the invoke_subagent call. The prepare-dispatch case additionally
runs each split-part envelope through the dispatch-policy contamination
rules, which report nothing.

AI-Assisted: true
Dispatch: stage-0 (elephant)
