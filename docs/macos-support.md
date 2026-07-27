# macOS acceptance status

Nova does not currently claim native macOS support or an Apple Silicon
closure. The registered `nova-macos-acceptance-tests` suite is a synthetic,
non-native contract check: it validates the closed acceptance record and
hostile failure paths only.

Native closure for Nova B6 requires all of the following for one exact frozen
candidate:

- a clean Apple Silicon host;
- native filesystem, process, tool-resolution and lifecycle observations;
- candidate-bound Full Verify and Security evidence;
- an independent Critic and Product Owner acceptance.

Intel, hosted CI and synthetic fixtures are distinct observation classes. They
never substitute for Apple Silicon evidence. A denied or unavailable
keep-awake observation is recorded as non-success and never becomes a
correctness or completion guarantee.

Evidence is restricted to sanitized versions, digests and closed status
values. It must not contain accounts, keychain data, secrets or private host
paths.
