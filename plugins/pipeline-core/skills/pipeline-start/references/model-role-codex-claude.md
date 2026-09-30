# Codex and Claude model-role bootstrap

For a new Codex or Claude session, run the installed
`scripts/model-role-bootstrap.mjs --repo-root <absolute-repo> --runner <current-runner>`.
Probe only the installed runner. A first or changed mapping needs the
displayed digest confirmed by the human in an attended terminal; an already
confirmed unchanged mapping is reused.

A missing or defective optional model-role source, approval, host observation,
identity, or receipt is reported as such. Retain the existing independently
governed V3 route for that session, never silently promote a new model or
turn the entire ready bootstrap into a partial lifecycle.
