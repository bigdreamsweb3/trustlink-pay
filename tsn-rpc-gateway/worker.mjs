import { createRpcGatewayApp } from "./gateway.mjs";
import { getRpcGatewayConfig } from "./config.mjs";

let app = null;

function getApp(env) {
  if (!app) {
    app = createRpcGatewayApp(getRpcGatewayConfig(env));
  }
  return app;
}

export default {
  fetch(request, env, ctx) {
    return getApp(env).fetch(request, env, ctx);
  },
};

export function fetch(request, env, ctx) {
  return getApp(env).fetch(request, env, ctx);
}
