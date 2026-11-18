import assert from "node:assert/strict";
import { mapCase11 } from "./map-case11.mjs";

export async function verifyRoute4045xxAndTransportFailureReachTheConfiguredFallback(captures) {
    for (const failure of [captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(404, { detail: "Not Found" }), new Response("missing", { status: 404 }),
        captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(500, { detail: "private dependency error" }), captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(503, {}), new Error("private endpoint credential"), captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.interrupted()]) {
        captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([failure, captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(200, { signatureBase64: "signature" })]);
        const result = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.requestNodeAuthorization(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.endpoint, captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body);
        assert.equal(result.response.status, 200);
        assert.deepEqual(await result.response.json(), { signatureBase64: "signature" });
        assert.deepEqual(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.map(mapCase11), ["http://primary-node.invalid" + captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.endpoint, "http://fallback-node.invalid" + captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.endpoint]);
        for (const call of captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls) {
            assert.equal(call.options.method, "POST");
            assert.equal(call.options.headers["x-api-key"], "isolated-test-credential");
            assert.equal(call.options.body, JSON.stringify(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body));
        }
    }
}
