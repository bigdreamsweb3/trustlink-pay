import assert from "node:assert/strict";

export async function verifyAuthenticationMalformedRequestsAndAbsentConfigurationDoNotContactNode(captures) {
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([]);
    assert.equal((await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body, "unauthorized"))).status, 401);
    assert.equal((await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request({ workId: "work" }))).status, 422);
    delete process.env.TSN_RECEIVER_NODE_API_KEY;
    const response = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "TSN Node signing service is not configured" });
    assert.equal(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.length, 0);
}
