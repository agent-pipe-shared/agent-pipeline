fix(native-host): keep the working-tree checker read for dependency readiness

The K-37 fix read every integrated item's check sources from the
candidate commit, in every caller of the integrated-slice scan. That
also changed observeGovernedItemIntegrationReadiness, the launch-time
read that releases a dependent: an uncommitted weakening of an
integrated item's checker no longer refused it (NGHS12 red).

The source is now a parameter. The default, read inside every stop and
admission boundary, stays the commit (K-37: an in-flight edit never
aborts a stop, NGHS71). The readiness observer passes 'worktree' and
refuses, as before 29d, while an integrated item's checker differs in
the working tree. The memo key carries the source.

AI-Assisted: true
Dispatch: stage-0 (elephant)
