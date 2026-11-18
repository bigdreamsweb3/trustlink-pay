/** Synthetic route request; fixture-specific argument defaults remain with the caller. */
import { requestFixtureBody } from "./request-fixture-body.mjs";

export function authenticatedRequestFixture(key, body) {
    return { headers: new Headers({ "x-api-key": key }), json: requestFixtureBody.bind(null, body) };
}
