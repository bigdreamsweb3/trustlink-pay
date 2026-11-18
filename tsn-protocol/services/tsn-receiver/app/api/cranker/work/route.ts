/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../lib/http/api/cranker/work/runtime";
import { PUT as PUTComponent } from "../../../../lib/http/api/cranker/work/PUT";
export const PUT = PUTComponent.bind(null, dependencies);
import { POST as POSTComponent } from "../../../../lib/http/api/cranker/work/POST";
export const POST = POSTComponent.bind(null, dependencies);
import { PATCH as PATCHComponent } from "../../../../lib/http/api/cranker/work/PATCH";
export const PATCH = PATCHComponent.bind(null, dependencies);
