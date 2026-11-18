/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../../lib/http/api/internal/node/coordination/runtime";
import { GET as GETComponent } from "../../../../../lib/http/api/internal/node/coordination/GET";
export const GET = GETComponent.bind(null, dependencies);
import { POST as POSTComponent } from "../../../../../lib/http/api/internal/node/coordination/POST";
export const POST = POSTComponent.bind(null, dependencies);
