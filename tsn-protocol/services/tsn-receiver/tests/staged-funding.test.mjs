import { after, test } from "node:test";
import { createStagedFixture } from "./cases/staged-funding/create-staged-fixture.mjs";
import { cleanupFixture } from "./cases/staged-funding/cleanup-fixture.mjs";
import { authorizationIngressTest } from "./cases/staged-funding/authorization-ingress-test.mjs";
import { initialIngressTest } from "./cases/staged-funding/initial-ingress-test.mjs";
import { readinessPrivacyTest } from "./cases/staged-funding/readiness-privacy-test.mjs";
import { readinessAttestationTest } from "./cases/staged-funding/readiness-attestation-test.mjs";
import { signedAttachmentTest } from "./cases/staged-funding/signed-attachment-test.mjs";
import { attachmentIdempotencyTest } from "./cases/staged-funding/attachment-idempotency-test.mjs";
import { attachmentConcurrencyTest } from "./cases/staged-funding/attachment-concurrency-test.mjs";
import { attachmentGuardsTest } from "./cases/staged-funding/attachment-guards-test.mjs";
import { fundingRouteTest } from "./cases/staged-funding/funding-route-test.mjs";
import { nonceClaimTest } from "./cases/staged-funding/nonce-claim-test.mjs";
import { confirmedLineageTest } from "./cases/staged-funding/confirmed-lineage-test.mjs";

/** Discovery facade; each case uses fresh explicit local storage and synthetic cryptographic material. */
const fixture = await createStagedFixture();
after(cleanupFixture.bind(null, fixture));
test("authorization ingress forbids premature signed deposit bytes and bank context", authorizationIngressTest.bind(null, fixture));
test("message-only funding persists idempotently without creating settlement", initialIngressTest.bind(null, fixture));
test("signed readiness keeps private preflight encrypted and cannot wake or lease a Cranker", readinessPrivacyTest.bind(null, fixture));
test("readiness attestation binds approval metadata and has no execution projection", readinessAttestationTest.bind(null, fixture));
test("signed deposit attaches to the same intent and creates final commitment settlement lineage", signedAttachmentTest.bind(null, fixture));
test("exact attachment replay survives later leases while all deposit replacements fail", attachmentIdempotencyTest.bind(null, fixture));
test("concurrent conflicting deposit attachments create one funding and settlement identity", attachmentConcurrencyTest.bind(null, fixture));
test("attachment readiness, expiry, version and canonical-bank-context guards are atomic", attachmentGuardsTest.bind(null, fixture));
test("HTTP signed funding attachment requires Node credentials and validates its guarded contract", fundingRouteTest.bind(null, fixture));
test("same-work nonce claims recover safely and conflicting claims remain exclusive", nonceClaimTest.bind(null, fixture));
test("confirmed funding retains final settlement lineage and private ingress while compacting execution receipt", confirmedLineageTest.bind(null, fixture));
