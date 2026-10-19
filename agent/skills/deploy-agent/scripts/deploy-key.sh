#!/usr/bin/env bash
# deploy-key.sh — set up secure, read-only access from a target host to private
# git config repos (the omp-home + example-data pattern).
#
# Generates a fresh ed25519 keypair LOCALLY, pushes the PRIVATE key to the
# target's ~/.ssh (0600) over SSH, and prints the PUBLIC key for one-time
# registration as a read-only deploy key on ONE repo (e.g. GitHub UI). No key
# material ever lands in this skill's repo or a committed file.
#
# A deploy key is scoped to a SINGLE repository — GitHub (and most hosts)
# forbid reusing one key across repos. If the host must clone several private
# repos (e.g. example-config AND example-data), run this script once per repo with a
# distinct <key-name>, and register each printed public key on its own repo.
#
# Usage:
#   scripts/deploy-key.sh <user@host> <key-name> [repo-host]
#     e.g. scripts/deploy-key.sh deploy@203.0.113.10 omp_backup
#     e.g. scripts/deploy-key.sh deploy@203.0.113.10 omp_backup gitlab.com
#
#   repo-host defaults to github.com. The ssh config append is guarded on the
#   Host block, so re-runs are idempotent (no duplicate Host blocks).
#
# Then, on the repo host, add the printed public key as a read-only deploy
# key to the ONE repo this key is for.
set -euo pipefail

HOST="${1:?usage: deploy-key.sh <user@host> <key-name> [repo-host]}"
KEY_NAME="${2:?usage: deploy-key.sh <user@host> <key-name> [repo-host]}"
REPO_HOST="${3:-github.com}"

KEY_DIR="$HOME/.agent-deploy/keys"
PRIV="$KEY_DIR/$KEY_NAME.ed25519"
PUB="$PRIV.pub"

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"

# Generate only if absent (idempotent). Re-run to print the key again.
if [ ! -f "$PRIV" ]; then
  echo "[deploy-key] generating ed25519 keypair"
  ssh-keygen -t ed25519 -f "$PRIV" -N "" -C "agent-deploy:$KEY_NAME" -q
fi

# Transfer the private key to the target (0600), then add a scoped ssh config
# entry. The config append only fires if the exact Host block is absent —
# re-runs never duplicate blocks.
echo "[deploy-key] installing private key on $HOST"
ssh "$HOST" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat > ~/.ssh/$KEY_NAME.ed25519 && chmod 600 ~/.ssh/$KEY_NAME.ed25519" < "$PRIV"
ssh "$HOST" "touch ~/.ssh/config; \\
  grep -qE '^Host $REPO_HOST\$' ~/.ssh/config || cat >> ~/.ssh/config <<EOF
Host $REPO_HOST
  HostName $REPO_HOST
  User git
  IdentityFile ~/.ssh/$KEY_NAME.ed25519
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config"

echo "[deploy-key] done. Register this PUBLIC key as a read-only deploy key"
echo "           on exactly ONE repo (on $REPO_HOST); a deploy key is scoped"
echo "           to a single repo, so run deploy-key.sh again per additional"
echo "           private repo the host must clone."
cat "$PUB"
