/** Production composition for durable local-Node authorization requests. */
import { requestLocalNode } from "./node-relay/request";
import { relayDependencies } from "./node-relay/runtime";
import { requestNodeAuthorization as component } from "./networking/node-authorization/request-node-authorization";
const dependencies = { environment: process.env, request: requestLocalNode.bind(null, relayDependencies) };
export const requestNodeAuthorization = component.bind(null, dependencies);
