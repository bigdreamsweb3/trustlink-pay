# TrustLink Pay Frontend

The frontend is the user-facing TrustLink Pay experience. It turns crypto payments into a mobile-first flow that feels closer to modern wallet apps and mobile money products than a traditional blockchain dashboard.

## What Lives Here

- send flow
- receive flow
- claim flow
- wallet connection UX
- token selection UI
- pending transaction and activity views
- profile and identity screens

## UX Goals

- make stablecoin transfers feel familiar
- reduce wallet-address anxiety
- guide users with clear confirmation states
- support WhatsApp-driven claim flows
- stay mobile-first while still looking polished on desktop

## Run Locally

```bash
npm install
npm run dev
```

The frontend talks to the backend through the configured backend URL and local proxy setup.

## Design Direction

TrustLink’s frontend is intentionally built around:

- clarity before complexity
- wallet-style navigation patterns
- strong transaction feedback
- clean send and claim confirmation steps

## Important Notes

- This folder contains application UI code and local dev-only configuration should never be committed.
- Public brand assets that are safe to expose on GitHub belong in the repository-level `public/` folder.
