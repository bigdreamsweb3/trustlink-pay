/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../lib/http/intents/runtime";
import { POST as POSTComponent } from "../../lib/http/intents/POST";
export const POST = POSTComponent.bind(null, dependencies);
import { GET as GETComponent } from "../../lib/http/intents/GET";
export const GET = GETComponent.bind(null, dependencies);
