/** Stable node-wake facade and production composition; implementations live in networking/node-wake. */
import { fetchResponse } from "./networking/common/fetch-response";
import { wakeTsnNode as wakeTsnNodeComponent } from "./networking/node-wake/wake-tsn-node";

const dependencies = {
  environment: process.env,
  fetch: fetchResponse,
};

export const wakeTsnNode = wakeTsnNodeComponent.bind(null, dependencies);
