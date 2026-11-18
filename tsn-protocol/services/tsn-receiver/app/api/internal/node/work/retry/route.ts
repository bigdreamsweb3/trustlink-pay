/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../../../lib/http/api/internal/node/work/retry/runtime";
import { POST as POSTComponent } from "../../../../../../lib/http/api/internal/node/work/retry/POST";
export const POST = POSTComponent.bind(null, dependencies);
