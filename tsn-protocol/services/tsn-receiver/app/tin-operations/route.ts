/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../lib/http/tin-operations/runtime";
import { GET as GETComponent } from "../../lib/http/tin-operations/GET";
export const GET = GETComponent.bind(null, dependencies);
import { POST as POSTComponent } from "../../lib/http/tin-operations/POST";
export const POST = POSTComponent.bind(null, dependencies);
