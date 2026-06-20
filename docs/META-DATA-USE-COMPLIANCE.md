# Metadata Use And Compliance

TrustLink Pay should collect and expose only the data needed for safe payments.

## What Is Metadata?

Metadata is information about a payment or identity that is not the token transfer itself.

Examples:

- TIN
- display name
- verification status
- payment status
- notification channel
- masked route or commitment reference

## Why Metadata Exists

Users need confidence.

They need to know who they are paying, whether a payment is pending, and whether a recipient has been paid.

## Data Rules

### Keep Public Data Minimal

Only show what helps the user understand the payment.

### Encrypt Social Identities

Social identities such as WhatsApp, email, or X should be encrypted before storage when they are linked to a TIN.

### Require Consent For Sensitive Data

Sensitive data should require explicit user authorization before decryption.

### Do Not Expose Payment Graphs

Dashboards and explorers should show commitments, aggregate roots, masked recovery data, and safe status. They should not show full private routes.

## WhatsApp And Phone Numbers

Phone numbers can be used for authentication, notifications, and confidence checks.

They should not be treated as the core protocol identity. The core payment identity is the TIN.

## Important Limits

Compliance requirements vary by country and product launch scope.

This document explains project data principles. It is not legal advice.
