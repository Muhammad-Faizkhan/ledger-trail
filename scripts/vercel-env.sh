#!/usr/bin/env bash
# Copies the live Firebase settings from .env.production.local into the linked
# Vercel project's Production environment. Run after `vercel link`.
# Safe to re-run: an existing value is removed first, then added again.
set -euo pipefail
cd "$(dirname "$0")/.."

for name in NEXT_PUBLIC_FIREBASE_API_KEY NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
            NEXT_PUBLIC_FIREBASE_PROJECT_ID NEXT_PUBLIC_FIREBASE_APP_ID; do
  value=$(grep -E "^${name}=" .env.production.local | head -1 | cut -d= -f2- | tr -d '\r"')
  if [ -z "$value" ]; then echo "Missing $name in .env.production.local" >&2; exit 1; fi
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production
done
echo "Done. NEXT_PUBLIC_USE_EMULATORS is left unset, so the live app talks to Firebase."
