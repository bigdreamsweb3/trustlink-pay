/** Stable Next route facade; implementations are bound at this request boundary. */
export const runtime = "nodejs";
import { dependencies } from "../../../../../../lib/http/api/internal/node/work/reconcile/runtime";
import { POST as POSTComponent } from "../../../../../../lib/http/api/internal/node/work/reconcile/POST";
export const POST = POSTComponent.bind(null, dependencies);
