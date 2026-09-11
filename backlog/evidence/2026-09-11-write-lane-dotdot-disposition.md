# Write-lane symlink-plus-dotdot closure disposition

- Backlog item: `pipeline.write-lane-containment-may-share-read-lane-dotdot-bypass`
- Evidence commit: `0a0b3ad9b56c9eff97d5d8323aa102e1e9b1578c`
- Disposition: **shape present, not exploitable in the measured Write host**

The item required one discriminating real host-tool observation. That
observation was recorded in the versioned item at the evidence commit. A
fixture placed an in-root symlink beside an out-of-root directory and sent a
`link/../outside/marker-write-test.txt` target through the real `Write` tool.
The host admitted the request but lexically collapsed the path and wrote to a
new directory below the fixture root. The symlink's actual out-of-root target
remained empty.

This satisfies the item's allowed non-exploitable outcome: the guard and the
measured host agree on lexical path resolution, so the suspected divergence
did not occur. No source correction is justified from this evidence.

The result is deliberately scoped to the measured `Write` host behavior. A
future host that sends the raw path to kernel-order resolution, or evidence
that Edit/NotebookEdit use materially different resolution, would be a new
observation and regression risk rather than an unproven reason to keep this
specific investigation open.
