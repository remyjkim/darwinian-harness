---
sidebar_position: 1
---

# Overview

There are four ways people typically arrive at `drwn`. Each has a dedicated page with prerequisites, steps, and verification. Pick the one that matches what you are trying to do.

## Use a Team's Harness

You joined a project or a team that already publishes a mind card and you want to consume it. The card encodes which skills, MCP servers, and extensions the team has agreed on; you install it into the project and let `drwn write` materialize the downstream state. This path is right for you when somebody else owns the harness intent and you just need to run it.

See [Use a Team's Harness](./use-team-harness).

## Set Up Your Machine

You are installing `drwn` for the first time and want explicit machine intent
before project work. This path covers empty versus guided initialization, the
recommended immutable Worker Blueprint, consent, and an ownership-checked
machine projection.

See [Set Up Your Machine](./setup-your-machine).

## Override for One Project

One project needs a reproducible declared harness. This path scaffolds strict
project V1 state, installs alternative Worker roots, selects at most one, and
projects only that closure plus explicit project overlays. Machine capabilities
remain separate and may only be visible ambiently through the downstream tool.

See [Override for One Project](./override-one-project).

## Author and Publish a Card

You want to package a harness — yours or your team's — as a reusable, versioned card others can consume. This path covers creating a source, adding skills and MCP servers, setting metadata and quality signals, and publishing the card to the local store (and optionally a Git remote). This path is right for you when you are the one defining the harness intent for someone else.

See [Author and Publish a Card](./author-and-publish-card).
