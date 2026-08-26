#!/usr/bin/env bash
set -Eeuo pipefail

mkdir -p "$HOME/.local/share/keyrings"
KEYRING_OUTPUT="$(printf '\n' | gnome-keyring-daemon --unlock --components=secrets)"
GNOME_KEYRING_CONTROL="$(printf '%s\n' "$KEYRING_OUTPUT" | sed -n 's/^GNOME_KEYRING_CONTROL=//p' | tr -d ';')"
export GNOME_KEYRING_CONTROL
[[ -n "$GNOME_KEYRING_CONTROL" ]]
bun test test/core-secret-store-backends.test.ts
