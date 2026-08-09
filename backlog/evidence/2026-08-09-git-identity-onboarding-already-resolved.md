# Closure evidence — git author identity was already diagnosed at onboarding time

Item: `backlog/items/2026-08-09-fresh-repo-onboarding-never-asks-for-git-identity.md`
Date: 2026-08-09

## What the item asked for

At the point onboarding first runs `git init` for a brand-new repository,
check for a usable `user.name`/`user.email` (local or global git config) and
ask once if neither resolves, rather than discovering the gap only when the
first commit fails with git's own "Please tell me who you are" error.

## What was found on inspection

Commit `b045e391513de1b2d16083ba2fe2dfc6b07f9061` ("fix(interface): --help
is a question, and a repository gets told it cannot commit"), made the same
day at 12:06:29 — before this session's own GF-06x dispatch sequence began,
and not authored as part of it — already added exactly this diagnostic to
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`. Its own commit
message states the same root cause independently: "onboarding initializes
the repository and never looked at whether anything could commit into it,
so the stop landed several steps later, mid-implementation, where only the
human could answer."

The shape differs from the item's proposed "ask once": the seed **warns**
at repository-creation time with the exact remediation commands, and
deliberately does not configure an identity itself — the commit reasons
that inventing an author identity would put a fabricated name into
permanent history, which is worse than the stop it prevents. Non-fatal by
construction: a host-managed mount, an unreadable Git, or any probe failure
yields no diagnostic rather than a false alarm.

`AUTHORID-1` (added in `b045e391`) pins both halves, including that the
seed writes no `[user]` section into the repository it created.

## Why this closes the item without new work

The reported gap — the PO only discovering a missing identity at
first-commit time, mid-implementation — is what the warn-at-creation
diagnostic prevents. The specific interaction shape (ask-once vs.
warn-with-remediation) is an implementation choice already made and
shipped; re-opening it as new work would duplicate `b045e391` rather than
fix anything still broken.

## Result

`project-onboarding-v3.test.mjs` 112/112 (as recorded in `b045e391`'s own
commit message); no further change made under this item.
