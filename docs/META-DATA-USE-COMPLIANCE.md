# Meta Data Use and WhatsApp Compliance Policy

Last reviewed: May 26, 2026

This document explains how TrustLink Pay uses Meta and WhatsApp platform services, what Meta policies cover that usage, and the operating rules future developers must follow so the app does not lose access to Meta APIs.

This is an internal engineering and product policy. It is not legal advice. If TrustLink Pay changes its Meta use case, adds new permissions, expands marketing, or starts processing regulated data in new regions, the team must review this document with legal, privacy, and policy guidance before shipping.

---

## Why This Matters

TrustLink Pay relies on Meta/WhatsApp for a meaningful part of the user experience, especially phone-based authentication, session verification, OTP-style flows, payment notifications, and user communication.

If Meta restricts the app, some TrustLink user flows may be degraded or interrupted. Because of that dependency, the team must treat Meta access as a critical platform risk, similar to database access, RPC access, wallet signing, or payment infrastructure.

Our goal is simple:

1. Use only the Meta permissions and WhatsApp capabilities required for TrustLink Pay.
2. Handle Platform Data safely and minimally.
3. Avoid spam, unauthorized messaging, misleading content, or off-purpose data use.
4. Keep documentation and annual checkups accurate.
5. Design fallback paths so TrustLink is not permanently blocked if Meta access changes.

---

## Official Policy Sources

Developers must review the latest official Meta documents before making policy-sensitive changes:

- Meta Platform Terms: https://developers.facebook.com/terms/
- Meta Developer Policies: https://developers.facebook.com/devpolicy/
- Meta Data Handling Questions guidance: https://developers.facebook.com/docs/development/release/data-handling-questions/
- WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy
- WhatsApp Business Platform docs: https://developers.facebook.com/docs/whatsapp/

Meta policies can change. This document reflects the project posture as of May 26, 2026 and must be rechecked during each Data Use Checkup or major product change.

---

## Current Meta/WhatsApp Use Case

TrustLink Pay may use Meta/WhatsApp for:

- User authentication and session verification.
- OTP or verification-code delivery.
- Security messages related to login, wallet binding, or session review.
- Payment notifications, claim links, transaction references, and user support messages.
- Basic app identity and account personalization when `public_profile` is available.
- Aggregated and de-identified analytics needed to understand reliability, delivery, and abuse prevention.

TrustLink Pay must not use Meta Platform Data for unrelated advertising, resale, surveillance, discriminatory decisioning, credit/insurance/employment eligibility, or hidden profiling.

---

## Platform Data We May Receive

"Platform Data" means data received from Meta or through Meta/WhatsApp platform services. Examples may include:

- Meta app user ID or public profile fields.
- WhatsApp phone number identifiers or messaging metadata.
- Message delivery status, timestamps, and interaction metadata.
- Meta access tokens, app tokens, webhook secrets, app secret, or API credentials.
- Profile data automatically granted through `public_profile`.

TrustLink Pay should collect and store the minimum amount needed for the service. If a value is only needed transiently, do not persist it.

---

## Certified Permission: `public_profile`

TrustLink Pay may use `public_profile` only for allowed purposes:

- Authenticate users.
- Provide a personalized in-app experience.
- Support account, security, and user experience flows.
- Use aggregated, de-identified, or anonymized information for product analytics, provided it cannot reasonably be re-identified.

TrustLink Pay must not:

- Sell or license public profile data.
- Publish profile data outside the user experience without user expectation and permission.
- Use public profile data for unrelated targeting, eligibility decisions, surveillance, or discrimination.

---

## Data Processors and Service Providers

TrustLink Pay uses infrastructure providers that may process Platform Data on our behalf. During Meta Data Use Checkup, each provider should be listed separately, not grouped in one field.

Common providers for this project may include:

| Provider | Likely category | Notes |
| --- | --- | --- |
| Vercel Inc. | IT solutions and services, including cloud storage and processing | Frontend/backend hosting and serverless runtime. |
| Google LLC / Firebase | IT solutions and services, including cloud storage and processing | Firebase credentials, Firestore, or related backend services if enabled. |
| Neon, Inc. | IT solutions and services, including cloud storage and processing | Postgres database hosting if used. |
| Upstash, Inc. or actual Redis provider | IT solutions and services, including cloud storage and processing | Only list if Redis is externally hosted. |
| Helius Labs, Inc. or actual Solana RPC provider | IT solutions and services, including cloud storage and processing | Only list the RPC provider actually used. |
| Logging/monitoring provider, if any | Analytics and measurements; IT solutions and services | Only list if external logs receive Meta-derived data. |

Do not list "Meta WhatsApp Business Platform" as our processor in this section unless Meta is separately processing Platform Data on TrustLink's behalf beyond providing the platform service. In most Data Use Checkup contexts, Meta is the platform data source, not our service provider.

For countries, use the provider's official processing locations. If unknown and the provider is US-based, select United States of America and update when provider documentation gives more detail.

---

## Data Controller / Responsible Entity

The entity responsible for Platform Data is the legal person or business that controls why and how the data is processed.

Use:

- TrustLink Pay's registered legal entity name, if incorporated.
- The founder/operator's full legal name, if no company exists yet.

Do not use an informal product name as the controller unless it is also the registered legal entity.

---

## Government and Public Authority Requests

TrustLink Pay's policy is:

- Review every government/public authority request for legality before responding.
- Challenge unlawful, overbroad, or unclear requests where appropriate.
- Disclose only the minimum data legally required.
- Document the request, response, legal basis, reviewer, and decision.

If TrustLink has not provided user personal data in response to national security requests in the past 12 months, the Meta form should answer "No".

Developers must not disclose Platform Data to public authorities casually, through support channels, or without founder/legal approval.

---

## Required Developer Rules

Every developer working on TrustLink Pay must follow these rules:

1. Do not request new Meta permissions unless a product requirement genuinely needs them.
2. Do not keep advanced access for unused permissions or features.
3. Do not store Meta access tokens, app secrets, webhook secrets, or user identifiers in client-side code.
4. Do not log OTP codes, access tokens, app secrets, full webhook payloads, or private user message content.
5. Do not send WhatsApp messages without a valid user-expected purpose.
6. Do not use WhatsApp for spam, cold marketing, unrelated promotions, or misleading financial claims.
7. Do not share Platform Data with a new vendor until the vendor is added to this document and reviewed for the next Meta checkup.
8. Do not use Platform Data to discriminate, surveil, or make eligibility decisions.
9. Do not retain Platform Data longer than needed for authentication, security, audit, support, and payment record integrity.
10. Do not ship a new Meta/WhatsApp feature without updating privacy documentation and this policy if data use changes.

---

## WhatsApp Messaging Rules

TrustLink Pay WhatsApp messages should be:

- Expected by the user.
- Transactional, authentication-related, security-related, support-related, or directly related to a TrustLink payment flow.
- Clear about who is sending the message and why.
- Limited to the minimum content needed.
- Respectful of opt-out or stop requests where applicable.

Allowed examples:

- "Your TrustLink login code is 123456."
- "A payment claim was created for reference ABC123."
- "Review this TrustLink session request."
- "Your payment notification was delivered."

Avoid:

- Unsolicited promotional blasts.
- Investment promises or yield claims sent through WhatsApp without proper compliance review.
- Messages that pressure users to connect wallets or reveal seed phrases.
- Messages that expose sensitive sender/receiver wallet information unnecessarily.

TrustLink must never ask for seed phrases, private keys, or wallet recovery phrases through WhatsApp.

---

## Retention and Deletion

TrustLink Pay may retain Platform Data only as long as needed for:

- Authentication and active account/session security.
- Payment notification delivery and support.
- Fraud, abuse, or audit logs.
- Legal, accounting, or regulatory obligations.
- Debugging delivery issues, with sensitive values minimized or redacted.

When no longer needed, Platform Data should be deleted, anonymized, or de-identified.

User deletion requests must be honored according to TrustLink's privacy policy and applicable law. If a deletion request conflicts with legal or fraud-prevention retention, retain only the minimum data required and document the reason.

---

## Privacy Policy Requirements

TrustLink Pay must maintain a public privacy policy that explains:

- What data is collected from Meta/WhatsApp.
- Why the data is used.
- Which service providers may process it.
- How users can request deletion.
- How long data is retained.
- How users can contact TrustLink.

The Meta app dashboard must include:

- Privacy Policy URL.
- User Data Deletion Instructions URL.
- App contact email.
- Accurate app purpose and business details.

---

## Why Our Current Use Should Stay Compliant

As currently designed, TrustLink Pay's Meta/WhatsApp use is limited and purpose-bound:

- WhatsApp supports authentication, verification, security, and payment notification flows.
- `public_profile` is used only for authentication and basic personalization if applicable.
- Platform Data is not sold, licensed, or used for unrelated profiling.
- Payment settlement is handled by TrustLink/TSN/Solana infrastructure, not by misusing Meta data.
- Service providers are infrastructure processors, not independent users of Platform Data.
- Government requests are subject to legality review, minimization, challenge, and documentation.
- Future developers are required to remove unused permissions and avoid unnecessary advanced access.

This does not guarantee Meta will never restrict access. It does mean the current usage is structured to remain within the allowed purposes we certified during Data Use Checkup.

---

## High-Risk Changes That Need Review

Before shipping any of these, pause and review Meta policy:

- Adding new Meta permissions or advanced access.
- Using WhatsApp for marketing campaigns.
- Sending payment/yield/investment promotional messages.
- Sharing Meta-derived data with a new vendor.
- Storing more user profile data than the app needs.
- Building analytics that can identify individual users from Meta data.
- Introducing AI systems that inspect WhatsApp content or classify users using Platform Data.
- Moving infrastructure to new countries or providers.
- Changing the privacy policy, data deletion flow, or business controller.

If the team is unsure, default to "do not ship until reviewed."

---

## Operational Checklist for Meta Data Use Checkup

During each annual checkup:

1. Confirm the app is connected to the verified business or responsible entity.
2. Review every permission and feature.
3. Remove or downgrade unused permissions.
4. Certify `public_profile` only for authentication, personalization, and allowed aggregated analytics.
5. List each data processor separately.
6. Confirm processing countries from provider documentation where possible.
7. Confirm government request answers are accurate for the prior 12 months.
8. Confirm the privacy policy and data deletion URL are live.
9. Confirm no secrets are exposed in frontend code or public repositories.
10. Save a dated copy of answers or a summary in internal records.

---

## Fallback Planning

Because TrustLink relies partly on Meta/WhatsApp, the product should keep fallback options:

- Alternative OTP delivery provider.
- Email-based session verification.
- In-app claim links and QR claim flows.
- Manual support flow for payment notifications.
- TINS-first identity resolution that does not depend entirely on WhatsApp.

Meta access is important, but TrustLink architecture should not become permanently locked to one communications provider.

---

## Owner

Policy owner: TrustLink Pay founder/operator.

Developers must update this document whenever Meta/WhatsApp data use changes.

