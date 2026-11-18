import test from "node:test";
import { verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodes } from "./cases/private-credit-coordination/verify-epochs-paginate-defer-and-serialize-across-concurrent-nodes.mjs";

/** Discovery facade; fixture bodies and mutable capture contexts live in cases/private-credit-coordination. */
test("epochs paginate, defer and serialize across concurrent Nodes", verifyEpochsPaginateDeferAndSerializeAcrossConcurrentNodes);
