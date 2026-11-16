test(close): the bootstrap commit leaves a clean tree, not an unchanged one

The restated one-shot walk asserted that the tree after the first close call equals
the tree before it. In the Antigravity case a Critic lineage registration was
waiting uncommitted, and the owned commit of the bootstrap (commit-pipeline-owned
--agent, step 4 of the old repair chain) takes every pipeline-owned path that is
waiting, so the tree ends clean. The assertion now says that.

AI-Assisted: true
Dispatch: stage-0 (elephant)
