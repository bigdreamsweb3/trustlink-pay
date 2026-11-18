/** Stable node-proxy facade and production composition; implementations live in networking/node-proxy. */
import { fetchResponse } from "./networking/common/fetch-response";
import { proxyNode as proxyNodeComponent } from "./networking/node-proxy/proxy-node";

const dependencies = {
  environment: process.env,
  fetch: fetchResponse,
};

export const proxyNode = proxyNodeComponent.bind(null, dependencies);
