import test from "node:test";
import { httpRouteContractTest } from "./cases/http/http-route-contract-test.mjs";
test("Receiver HTTP preserves captured behavior with the explicit staged-ingress validator change",httpRouteContractTest);
