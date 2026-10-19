---
name: pb-release
description: "Cut a release in a package-profile repo: decide the window from milestones and the time cap, check release-please's version and notes, merge the release PR, verify tag, Release and artifact, close the milestone."
---
## When

A request to release, cut a release or merge the release PR; `pb-land` reporting that
a milestone's tasks are all `Done`; or a release PR open past the time cap. Package
profile only (`skill://git-conventions` `## Releases`).

Not: merging work PRs into trunk (`pb-land`); a `continuous` repo, where merge is ship
and there is nothing to cut.

## Outcome

A tag on trunk, its GitHub Release and any published artifact, each verified at the
released version, with the milestones it completed archived under a title that names
the tag.

## Todo

The todo is [`todo.json`](todo.json) beside this file: its phases and items, as data. The router hands it to you with the route; edit the steps there.

## Done when

- The release PR merged only when a milestone was complete, the time cap had passed, or the user asked
- The tag, the GitHub Release, the version file and the changelog's top entry agree, and any published artifact was fetched at that version
- Every milestone the release completed is archived with the tag in its title
- Reply: the tag and its URL, why the release was cut now, what it contains (milestones, and the `maintenance` work it swept up), what was verified and how, and what stays open.
