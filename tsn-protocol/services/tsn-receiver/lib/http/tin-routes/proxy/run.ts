/** Request component: original validation, status mapping, privacy projection and errors are preserved. */
import type { NextRequest } from "next/server";
import type { proxyNode } from "../../../node-proxy";
type Context = {
    params: Promise<{
        path: string[];
    }>;
};
import type { Dependencies } from "./dependencies";

export async function run(dependencies: Pick<Dependencies, "proxyNode">, request: NextRequest, context: Context) {
    return dependencies.proxyNode(request, `tin-routes/${(await context.params).path.join("/")}`);
}
