/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../lib/http/network/proxy/runtime";
import { GET as GETComponent } from "../../../lib/http/network/proxy/GET";
export const GET = GETComponent.bind(null, dependencies);
export const POST = GET;
