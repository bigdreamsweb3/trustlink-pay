import assert from "node:assert/strict";

export async function verifyDomain404AndAuthenticationValidationRejectionRemainTerminal(captures) {
    for (const [status, detail] of [[404, "Receiver work was not found"], [401, "Unauthorized"],
        [403, "Denied"], [409, "TCAP_EPOCH_ALREADY_ACCOUNTED"], [422, "Invalid transaction"]]) {
        captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked([captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json(status, { detail })]);
        const result = await captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.requestNodeAuthorization(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.endpoint, captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body);
        assert.equal(result.response.status, status);
        assert.deepEqual(await result.response.json(), { detail });
        assert.equal(captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.length, 1);
    }
}
