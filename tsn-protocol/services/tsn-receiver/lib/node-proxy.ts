/** Production composition for the local Node application facade. */
import { requireService } from "./auth";
import { requestLocalNode } from "./node-relay/request";
import { relayDependencies } from "./node-relay/runtime";
import { proxyNode as component } from "./networking/node-proxy/proxy-node";
export const proxyNode = component.bind(null, {requireService, request: requestLocalNode.bind(null, relayDependencies)});
