/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../lib/http/api/health/runtime";
import { GET as GETComponent } from "../../../lib/http/api/health/GET";
export const GET = GETComponent.bind(null, dependencies);
