import assert from "node:assert/strict";

export async function verifyDuplicateEndpointsRunOnceAndFailedForwardingHasBoundedDiagnostics(captures) {
    process.env.TSN_NODE_FALLBACK_URL = " 'http://primary-node.invalid/' ";
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(404, { detail: "Not Found at private URL" })]);
    const result = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.requestNodeAuthorization(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.endpoint, captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body);
    assert.equal(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.length, 1);
    assert.deepEqual(result, { configured: true, response: null, nodeStatus: 404 });
    process.env.TSN_NODE_FALLBACK_URL = "http://fallback-node.invalid";
}
