import { fixtureCallback } from "./fixture-callback.mjs";

export function mockedComponent(captures, responses) {
    const mockedComponentContext = {};
    mockedComponentContext.responses = responses;
    captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls = [];
    globalThis.fetch = fixtureCallback.bind(null, {
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: captures.verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext,
        mockedComponentContext: mockedComponentContext
    });
}
