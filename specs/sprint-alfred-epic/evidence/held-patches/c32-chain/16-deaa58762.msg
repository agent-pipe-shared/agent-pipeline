docs(usage): add the 0.7.0 what's-new page and the feature path from an idea to the implementation phase

The 0.7.0 user documentation lagged the product: there was no whats-new page for the release line, the greenfield path (design, review course, one signature, implementation phase, close, push) was written only for agents in the plugin's references, and the limits the three greenfield runs met were nowhere a user could read them.

whats-new-0.7.0.md names what the candidate adds, what its runs changed and, in the same words as its status note, what stays open (no tag, no publication, Full Verify, Critic review and PO acceptance not complete), with a bounded German reader aid after the marker as the 0.6.0 page has. usage.md gains the chapter "From an idea to the implementation phase": a table of who does each step with the four human decisions, then the PRD and Spec (acceptance rows with journeys and asserts, exact owned paths, ADR proposals), the review course (one full round, at most two delta rounds, the receipt, the preview of the boundary check), the signature and the commit it binds, the implementation phase, the one-command close and its acceptance question, push and release, restarting a session. runner-support.md gains the rows that differ along the path, each with its source in the happy-path guide; known-issues.md lists the seven limits a user can meet with their repair; the docs index and the overview link the new page. The governance classification lists the new page as a public-user document (the plugin's reader-input mirror follows at the next sync).

Facts were taken from the shipped references and from the commit messages of this candidate, not from memory; unsourced runner cells say so. No private project name or machine path.

AI-Assisted: true
Dispatch: stage-0 (elephant)
