fix(sbom): keep a yarn v1 range overridden to a git source partial

- a resolutions override keeps the semver descriptor but resolves a git
  protocol, a forge archive (codeload, /archive/, GitLab /-/archive/) or a
  local file: still not a registry version
- a registry package merely named archive or zip stays a component
- the byte-order mark is spelled as an escape in the close module

AI-Assisted: true
Dispatch: stage-0 (elephant)
