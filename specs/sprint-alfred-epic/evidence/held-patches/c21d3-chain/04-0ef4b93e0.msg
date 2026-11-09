fix(session-cleanup): treat the hook identity anchor of every runner as no cleanup session

The PF-50 filter skipped only claude-<id> anchors, while the Codex and Antigravity hooks create the same zero-authority descriptor. After a closed feature the anchor of the session that closed it read as residue, so its re-entry after a plugin update stopped at orphan-recovery-unavailable and the push stayed out of reach. The filter now covers all three runner shapes; a descriptor with an owner runtime or a cleanup manifest still counts.

AI-Assisted: true
Dispatch: stage-0 (elephant)
