import { compileReceiverFixture } from "../../support/compile-receiver-fixture.mjs";
import { mkdtemp } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { mapCase } from "./map-case.mjs";
import { mockedComponent } from "./mocked-component.mjs";
import { jsonComponent } from "./json-component.mjs";
import { interruptedComponent } from "./interrupted-component.mjs";
import { verifyDomain404AndAuthenticationValidationRejectionRemainTerminal } from "./verify-domain404-and-authentication-validation-rejection-remain-terminal.mjs";
import { verifyRoute4045xxAndTransportFailureReachTheConfiguredFallback } from "./verify-route4045xx-and-transport-failure-reach-the-configured-fallback.mjs";
import { verifyDuplicateEndpointsRunOnceAndFailedForwardingHasBoundedDiagnostics } from "./verify-duplicate-endpoints-run-once-and-failed-forwarding-has-bounded-diagnostics.mjs";
import { requestComponent } from "./request-component.mjs";
import { verifySigningRouteForwardsDomain404AndReturnsSanitized503ForUnavailableEndpoints } from "./verify-signing-route-forwards-domain404-and-returns-sanitized503-for-unavailable-endpoints.mjs";
import { verifyAuthenticationMalformedRequestsAndAbsentConfigurationDoNotContactNode } from "./verify-authentication-malformed-requests-and-absent-configuration-do-not-contact-node.mjs";

export async function verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailability(t) {
    const verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext = {};
    const directory = await mkdtemp(path.join(os.tmpdir(), "tsn-node-forwarding-"));
    const variables = ["TSN_NODE_URL", "TSN_NODE_FALLBACK_URL", "TSN_RECEIVER_NODE_API_KEY"];
    const previous = Object.fromEntries(variables.map(mapCase));
    const previousFetch = globalThis.fetch;
    process.env.TSN_NODE_URL = "http://primary-node.invalid/";
    process.env.TSN_NODE_FALLBACK_URL = "http://fallback-node.invalid";
    process.env.TSN_RECEIVER_NODE_API_KEY = "isolated-test-credential";
    try {
        await compileReceiverFixture(directory, ["node-authorizations.ts"], { routes: [
                { path: "app/api/cranker/settlement-signature/route.ts", output: "route" },
            ] });
        await writeFile(path.join(directory, "next-stub.mjs"), 'export class NextResponse extends Response { static json(data, options={}) { return new this(JSON.stringify(data), {...options,headers:{"content-type":"application/json"}}); } }');
        await writeFile(path.join(directory, "cranker-auth.mjs"), 'export async function authenticateCrankerRequest(request) { if(request.headers.get("x-test-cranker")!=="operator") throw new Error("CRANKER_SESSION_INVALID"); return "operator"; } export async function enforceCrankerLeaseRateLimit() {}');
        const { requestNodeAuthorization } = await import(pathToFileURL(path.join(directory, "node-authorizations.mjs")).href);
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.requestNodeAuthorization = requestNodeAuthorization;
        const { POST } = await import(pathToFileURL(path.join(directory, "route.mjs")).href);
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.POST = POST;
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.endpoint = "/internal/settlement-authorizations/signature";
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.body = { workId: "work", crankerPubkey: "operator", messageBase64: "dGVzdA==" };
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.calls = [];
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.mocked = mockedComponent.bind(null, {
            verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext
        });
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.json = jsonComponent;
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.interrupted = interruptedComponent;
        await t.test("domain404 and authentication/validation rejection remain terminal", verifyDomain404AndAuthenticationValidationRejectionRemainTerminal.bind(null, {
            verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext
        }));
        await t.test("route404,5xx and transport failure reach the configured fallback", verifyRoute4045xxAndTransportFailureReachTheConfiguredFallback.bind(null, {
            verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext
        }));
        await t.test("duplicate endpoints run once and failed forwarding has bounded diagnostics", verifyDuplicateEndpointsRunOnceAndFailedForwardingHasBoundedDiagnostics.bind(null, {
            verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext
        }));
        verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext.request = requestComponent;
        await t.test("signing route forwards domain404 and returns sanitized503 for unavailable endpoints", verifySigningRouteForwardsDomain404AndReturnsSanitized503ForUnavailableEndpoints.bind(null, {
            verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext
        }));
        await t.test("authentication, malformed requests and absent configuration do not contact Node", verifyAuthenticationMalformedRequestsAndAbsentConfigurationDoNotContactNode.bind(null, {
            verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext: verifyNodeForwardingDistinguishesDomainRejectionFromServiceAvailabilityContext
        }));
    }
    finally {
        globalThis.fetch = previousFetch;
        for (const key of variables) {
            if (previous[key] === undefined)
                delete process.env[key];
            else
                process.env[key] = previous[key];
        }
        await rm(directory, { recursive: true, force: true });
    }
}
