import assert from "node:assert/strict";

export async function verifySigningRouteForwardsDomain404AndReturnsSanitized503ForUnavailableEndpoints(captures) {
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(404, { detail: "Receiver work was not found" })]);
    let response = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { detail: "Receiver work was not found" });
    assert.equal(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.length, 1);
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([new Error("secret URL"), captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(404, { detail: "private URL Not Found" })]);
    response = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "TSN Node signing service is unavailable", nodeStatus: 404 });
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([new Error("private credential"), new Error("private credential")]);
    response = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "TSN Node signing service is unavailable" });
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.interrupted(), captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.interrupted()]);
    response = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "TSN Node signing service is unavailable" });
}
