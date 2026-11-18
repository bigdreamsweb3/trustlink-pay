/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../lib/http/api/work-status/by-id/runtime";
import { GET as GETComponent } from "../../../../lib/http/api/work-status/by-id/GET";
export const GET = GETComponent.bind(null, dependencies);
