import assert from "node:assert/strict";

export async function fixtureCallback(captures, url, options) {
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.push({ url, options });
    const result = captures.mockedComponentContext.responses[captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls.length - 1];
    if (result instanceof Error)
        throw result;
    assert.ok(result, "unexpected fallback request");
    return result;
}
