/** Stable node-envelope facade and production composition; implementations live in security/node-envelope. */
import { encryptPayloadForNode as encryptPayloadForNodeComponent } from "./security/node-envelope/encrypt-payload-for-node";
import { decryptPayloadForNode as decryptPayloadForNodeComponent } from "./security/node-envelope/decrypt-payload-for-node";

const dependencies = {
  environment: process.env,
};

export const encryptPayloadForNode = encryptPayloadForNodeComponent.bind(null, dependencies);

export const decryptPayloadForNode = decryptPayloadForNodeComponent.bind(null, dependencies);

export type { NodePayloadEnvelope } from "./security/node-envelope/configuration";
