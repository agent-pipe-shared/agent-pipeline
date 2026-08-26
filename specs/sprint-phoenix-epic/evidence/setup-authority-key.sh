#!/usr/bin/env bash
# SPDX-License-Identifier: SUL-1.0
#
# Create the Product Owner's external §7 signing material.
#
# RUN THIS YOURSELF. The private key is your authority credential; no agent may
# generate, read, copy or use it. The directory must live OUTSIDE the repository
# — phoenix-authority-approval.mjs refuses a directory inside the checkout.
#
#   bash specs/sprint-phoenix-epic/evidence/setup-authority-key.sh ~/.phoenix-authority
#
# Contract derived from plugins/pipeline-core/lib/authority-revision-proof.mjs:
#   * verify(null, …) plus `openssl pkeyutl -sign -rawin` require an Ed25519 key.
#   * trust-policy.json must have EXACTLY the keys keyReference and
#     publicKeySha256 — any extra or missing key fails the closed-shape check.
#   * publicKeySha256 is the SHA-256 over the public-key PEM file's bytes,
#     exactly as read, including its trailing newline.
set -euo pipefail

DIR="${1:?usage: setup-authority-key.sh <external-directory>}"
KEY_REFERENCE="${2:-po-phoenix-ed25519-v1}"

if [ -e "$DIR/po-private.pem" ]; then
  echo "refusing to overwrite an existing key at $DIR/po-private.pem" >&2
  exit 1
fi

mkdir -p "$DIR"
chmod 700 "$DIR"

openssl genpkey -algorithm ed25519 -out "$DIR/po-private.pem"
chmod 600 "$DIR/po-private.pem"
openssl pkey -in "$DIR/po-private.pem" -pubout -out "$DIR/po-public.pem"
chmod 600 "$DIR/po-public.pem"

PUBLIC_SHA256="$(sha256sum "$DIR/po-public.pem" | cut -d' ' -f1)"
printf '{"keyReference":"%s","publicKeySha256":"%s"}\n' "$KEY_REFERENCE" "$PUBLIC_SHA256" > "$DIR/trust-policy.json"
chmod 600 "$DIR/trust-policy.json"

echo "created:"
echo "  $DIR/po-private.pem   (keep private, never copy into the repository)"
echo "  $DIR/po-public.pem"
echo "  $DIR/trust-policy.json  keyReference=$KEY_REFERENCE"
echo
echo "NOTE: the approve step below is human-only and needs a REAL TERMINAL."
echo "      openssl prompts for the passphrase on the controlling terminal; an"
echo "      agent session and the CLI's '!' prefix have none and will fail with"
echo "      'pkeyutl: Error loading key'. A failed attempt leaves nothing behind."
echo "      Never pass the passphrase via arguments or environment variables."
echo
echo "next, after the lifecycle is back in design phase:"
echo "  node specs/sprint-phoenix-epic/evidence/make-authority-revision-proposal.mjs"
echo "  node plugins/pipeline-core/scripts/phoenix-authority-approval.mjs prepare --repo-root \"\$PWD\" --directory $DIR --proposal <generated>"
echo "  node plugins/pipeline-core/scripts/phoenix-authority-approval.mjs approve --repo-root \"\$PWD\" --directory $DIR --proposal <generated>"
echo "  node plugins/pipeline-core/scripts/phoenix-authority-approval.mjs verify  --repo-root \"\$PWD\" --directory $DIR --proposal <generated>"
