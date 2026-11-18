import type { Dependencies } from "./dependencies";
import type { NextRequest } from "next/server";
import { equal } from "./equal";

/** requireService component. Inputs and results retain the original auth contract; declared dependencies identify replaceable ports. Errors propagate in their original order. */
export function requireService(dependencies: Pick<Dependencies, "environment">, request: NextRequest, service: "node") {
  const expected = service === "node" ? dependencies.environment.TSN_RECEIVER_NODE_API_KEY : undefined;
  const actual = request.headers.get("x-api-key") ?? "";
  if (!expected || !actual || !equal(actual, expected)) {
    throw new Error("UNAUTHORIZED_SERVICE");
  }
}
