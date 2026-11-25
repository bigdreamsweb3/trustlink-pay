/** Receiver publishes a payload-free revision for local Nodes to observe over outbound connections. */
import { signalLocalNode } from "./node-relay/signal-node";
import { relayDependencies } from "./node-relay/runtime";
import { wakeTsnNode as component } from "./networking/node-wake/wake-tsn-node";
export const wakeTsnNode = component.bind(null, {signal:signalLocalNode.bind(null,relayDependencies)});
