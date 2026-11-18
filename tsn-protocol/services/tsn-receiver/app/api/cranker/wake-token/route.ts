/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../lib/http/api/cranker/wake-token/runtime";
import { POST as POSTComponent } from "../../../../lib/http/api/cranker/wake-token/POST";
export const POST = POSTComponent.bind(null, dependencies);
