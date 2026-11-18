import test from "node:test";
import { crankerSessionPorts } from "./cases/component-ports/cranker-session-ports.mjs";
import { nodeStatePorts } from "./cases/component-ports/node-state-ports.mjs";

test("Cranker component ports preserve challenge consumption, signed counters and lease rate limits", crankerSessionPorts);
test("Node state components use only supplied collection and transaction ports", nodeStatePorts);
