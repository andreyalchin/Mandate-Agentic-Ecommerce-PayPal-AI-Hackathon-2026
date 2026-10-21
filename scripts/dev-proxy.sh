#!/usr/bin/env bash
# Development inside Perplexity Computer: run the server behind the credential proxy,
# which injects PayPal (and Anthropic) credentials. Elsewhere, use .env and `npm run dev`.
cd "$(dirname "$0")/.."
PAYPAL_CLIENT_ID=proxy-injected PAYPAL_CLIENT_SECRET=proxy-injected PORT=${PORT:-8787} exec npx tsx src/server/index.ts
