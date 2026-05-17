# TrustLink Pay Caching Architecture

TrustLink Pay uses two cache layers to reduce repeated API and database work during normal app navigation.

## Frontend

File:
[frontend/src/lib/api.ts](/C:/Users/codepara/Desktop/trust-link/frontend/src/lib/api.ts)

The frontend API client keeps a short-lived in-memory cache for browser navigation.

Behavior:

- GET requests are cached by default for 20 seconds.
- Cached POST reads are opt-in with `{ cache: "default" }`.
- Identical in-flight requests share one promise.
- Cache keys include method, path, auth scope, and stable request body.
- Mutations clear cached reads for payment, identity, receiver wallet, and settings data.
- Callers can opt out with `{ cache: "no-store" }`.

Cached frontend POST reads:

- `/api/wallet/tokens`
- `/api/recipient/lookup`
- `/api/whatsapp/verify-number`

This prevents page switches from refetching wallet balances, recipient identity checks, and WhatsApp verification data when the same user action has already loaded them.

## Backend

File:
[backend/app/lib/cache.ts](/C:/Users/codepara/Desktop/trust-link/backend/app/lib/cache.ts)

The backend wraps expensive read paths with Next.js `unstable_cache`.

Cached backend reads:

- `/api/payment/pending`
- `/api/payment/history`
- `/api/payment/[paymentId]`
- `/api/identity`
- `/api/settings/autoclaim`
- `/api/receiver-wallets`
- `/api/wallet/tokens`
- `/api/recipient/lookup`
- `/api/whatsapp/verify-number`

Cache key inputs:

- user id and phone number for authenticated user data
- payment id for payment detail
- wallet address for wallet token data
- phone number and lookup options for recipient data

Invalidation:

- payment mutations revalidate payment caches
- identity and receiver-wallet mutations revalidate identity caches
- autoclaim changes revalidate identity and payment caches
- recipient-affecting payment creation revalidates recipient and WhatsApp lookup caches

External fetch caching:

- token/SOL price fetches use `next.revalidate: 60`
- service-level price cache remains as a fast in-process fallback

## Route Design Rule

Use backend caching only for idempotent reads. Do not cache transaction preparation, payment creation, claim execution, refund execution, authentication verification, or OTP/PIN mutation routes.
