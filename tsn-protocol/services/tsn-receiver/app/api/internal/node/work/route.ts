/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../../lib/http/api/internal/node/work/runtime";
import { POST as POSTComponent } from "../../../../../lib/http/api/internal/node/work/POST";
export const POST = POSTComponent.bind(null, dependencies);
import { GET as GETComponent } from "../../../../../lib/http/api/internal/node/work/GET";
export const GET = GETComponent.bind(null, dependencies);
import { PATCH as PATCHComponent } from "../../../../../lib/http/api/internal/node/work/PATCH";
export const PATCH = PATCHComponent.bind(null, dependencies);
import { PUT as PUTComponent } from "../../../../../lib/http/api/internal/node/work/PUT";
export const PUT = PUTComponent.bind(null, dependencies);
